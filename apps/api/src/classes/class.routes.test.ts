import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { loadEnv } from "../load-env.js";
import { buildApp } from "../app.js";
import { prisma } from "../db.js";
import {
  deleteUsersByEmail,
  grantSchoolMembership,
} from "../test/school-member.js";

loadEnv();

function uniqueEmail(label: string): string {
  return `${label}.${Date.now()}.${Math.random().toString(16).slice(2)}@test.local`;
}

describe("class routes", () => {
  let app: FastifyInstance;
  let schoolId: string;
  let accessToken: string;
  let otherToken: string;
  let teacherEmail: string;
  const emails: string[] = [];
  const classIds: string[] = [];

  beforeAll(async () => {
    app = await buildApp({ logger: false });
    await app.ready();

    const school = await prisma.school.create({
      data: { name: `Test School ${Date.now()}` },
    });
    schoolId = school.id;

    teacherEmail = uniqueEmail("class-teacher");
    const otherEmail = uniqueEmail("other-teacher");
    emails.push(teacherEmail, otherEmail);

    const teacherRes = await app.inject({
      method: "POST",
      url: "/auth/register",
      payload: {
        name: "Class Teacher",
        email: teacherEmail,
        password: "Password123!",
      },
    });
    accessToken = (teacherRes.json() as { accessToken: string }).accessToken;

    const otherRes = await app.inject({
      method: "POST",
      url: "/auth/register",
      payload: {
        name: "Other Teacher",
        email: otherEmail,
        password: "Password123!",
      },
    });
    otherToken = (otherRes.json() as { accessToken: string }).accessToken;

    await grantSchoolMembership(teacherEmail, schoolId);
  });

  afterAll(async () => {
    if (classIds.length > 0) {
      await prisma.class.deleteMany({ where: { id: { in: classIds } } });
    }
    await prisma.school
      .delete({ where: { id: schoolId } })
      .catch(() => undefined);
    if (emails.length > 0) {
      await deleteUsersByEmail(emails);
    }
    await app.close();
    await prisma.$disconnect();
  });

  it("lists schools and creates a class for the teacher", async () => {
    const schools = await app.inject({
      method: "GET",
      url: "/schools",
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(schools.statusCode).toBe(200);
    expect(
      (schools.json() as Array<{ id: string }>).some((s) => s.id === schoolId),
    ).toBe(true);

    const created = await app.inject({
      method: "POST",
      url: "/classes",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        schoolId,
        name: "8-A",
        academicYear: "2025-26",
        subjectName: "Science",
      },
    });

    expect(created.statusCode).toBe(201);
    const body = created.json() as {
      id: string;
      name: string;
      studentCount: number;
    };
    classIds.push(body.id);
    expect(body.name).toBe("8-A");
    expect(body.studentCount).toBe(0);

    const listed = await app.inject({
      method: "GET",
      url: "/classes",
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(listed.statusCode).toBe(200);
    expect(
      (listed.json() as Array<{ id: string }>).some((c) => c.id === body.id),
    ).toBe(true);
  });

  it("imports valid CSV rows and reports per-row errors", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/classes",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        schoolId,
        name: "8-C",
        academicYear: "2025-26",
      },
    });
    const classId = (created.json() as { id: string }).id;
    classIds.push(classId);

    const csv = [
      "rollNumber,name,parentContact",
      "1,Aarav Sharma,",
      "bad,No Roll,",
      "2,Ananya Verma,9800000002",
      "2,Duplicate In File,",
    ].join("\n");

    const imported = await app.inject({
      method: "POST",
      url: `/classes/${classId}/students/import`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { csv },
    });

    expect(imported.statusCode).toBe(200);
    const result = imported.json() as {
      imported: number;
      failed: number;
      errors: Array<{ row: number; message: string }>;
      students: Array<{ rollNumber: number; name: string }>;
    };

    expect(result.imported).toBe(2);
    expect(result.failed).toBeGreaterThanOrEqual(2);
    expect(result.students.map((s) => s.rollNumber).sort()).toEqual([1, 2]);
    expect(result.errors.some((e) => e.row === 3)).toBe(true);
    expect(result.errors.some((e) => e.row === 5)).toBe(true);

    const students = await app.inject({
      method: "GET",
      url: `/classes/${classId}/students`,
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(students.statusCode).toBe(200);
    const body = students.json() as {
      items: unknown[];
      total: number;
      page: number;
    };
    expect(body.items.length).toBe(2);
    expect(body.total).toBe(2);
    expect(body.page).toBe(1);

    const filtered = await app.inject({
      method: "GET",
      url: `/classes/${classId}/students?q=1`,
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(filtered.statusCode).toBe(200);
    expect((filtered.json() as { total: number }).total).toBe(1);
  });

  it("forbids another teacher from viewing or importing an unassigned class", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/classes",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        schoolId,
        name: "9-A",
        academicYear: "2025-26",
      },
    });
    const classId = (created.json() as { id: string }).id;
    classIds.push(classId);

    const listStudents = await app.inject({
      method: "GET",
      url: `/classes/${classId}/students`,
      headers: { authorization: `Bearer ${otherToken}` },
    });
    expect([403, 404]).toContain(listStudents.statusCode);

    const importStudents = await app.inject({
      method: "POST",
      url: `/classes/${classId}/students/import`,
      headers: { authorization: `Bearer ${otherToken}` },
      payload: {
        csv: "rollNumber,name\n1,Someone\n",
      },
    });
    expect([403, 404]).toContain(importStudents.statusCode);
  });

  it("does not let an uninvited teacher see or create in another school", async () => {
    const schools = await app.inject({
      method: "GET",
      url: "/schools",
      headers: { authorization: `Bearer ${otherToken}` },
    });
    expect(schools.statusCode).toBe(200);
    expect(
      (schools.json() as Array<{ id: string }>).some((s) => s.id === schoolId),
    ).toBe(false);

    const created = await app.inject({
      method: "POST",
      url: "/classes",
      headers: { authorization: `Bearer ${otherToken}` },
      payload: {
        schoolId,
        name: `Intruder-${Date.now().toString(36)}`,
        academicYear: "2025-26",
      },
    });
    expect(created.statusCode).toBe(403);
    if (created.statusCode === 201) {
      classIds.push((created.json() as { id: string }).id);
    }
  });

  it("does not overwrite a student enrolled in a class the importer cannot access", async () => {
    const ownerClass = await app.inject({
      method: "POST",
      url: "/classes",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        schoolId,
        name: `Own-${Date.now().toString(36)}`,
        academicYear: "2025-26",
      },
    });
    expect(ownerClass.statusCode).toBe(201);
    const ownerClassId = (ownerClass.json() as { id: string }).id;
    classIds.push(ownerClassId);

    const firstImport = await app.inject({
      method: "POST",
      url: `/classes/${ownerClassId}/students/import`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { csv: "rollNumber,name\n41,Aarav Sharma\n" },
    });
    expect(firstImport.statusCode).toBe(200);
    expect((firstImport.json() as { imported: number }).imported).toBe(1);

    const attackerEmail = uniqueEmail("invited-attacker");
    emails.push(attackerEmail);
    const attackerRegister = await app.inject({
      method: "POST",
      url: "/auth/register",
      payload: {
        name: "Invited Attacker",
        email: attackerEmail,
        password: "Password123!",
      },
    });
    const attackerToken = (attackerRegister.json() as { accessToken: string })
      .accessToken;
    await grantSchoolMembership(attackerEmail, schoolId);

    const attackerClass = await app.inject({
      method: "POST",
      url: "/classes",
      headers: { authorization: `Bearer ${attackerToken}` },
      payload: {
        schoolId,
        name: `Atk-${Date.now().toString(36)}`,
        academicYear: "2025-26",
      },
    });
    expect(attackerClass.statusCode).toBe(201);
    const attackerClassId = (attackerClass.json() as { id: string }).id;
    classIds.push(attackerClassId);

    const secondImport = await app.inject({
      method: "POST",
      url: `/classes/${attackerClassId}/students/import`,
      headers: { authorization: `Bearer ${attackerToken}` },
      payload: { csv: "rollNumber,name,parentContact\n41,Hijacked,999\n" },
    });
    expect(secondImport.statusCode).toBe(200);
    const result = secondImport.json() as {
      imported: number;
      errors: Array<{ message: string }>;
      students: Array<{ name: string }>;
    };
    expect(result.imported).toBe(0);
    expect(result.students).toEqual([]);
    expect(result.errors.some((error) => /roll/i.test(error.message))).toBe(
      true,
    );

    const stored = await prisma.student.findFirstOrThrow({
      where: { schoolId, rollNumber: 41 },
    });
    expect(stored.name).toBe("Aarav Sharma");
    expect(stored.parentContact).toBeNull();
  });

  it("rejects creating a class in a school the teacher does not belong to", async () => {
    // Ensure this teacher already belongs to schoolId (not bootstrap / zero-assignment).
    const home = await app.inject({
      method: "POST",
      url: "/classes",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        schoolId,
        name: `Home-${Date.now().toString(36)}`,
        academicYear: "2025-26",
      },
    });
    expect(home.statusCode).toBe(201);
    classIds.push((home.json() as { id: string }).id);

    const foreignSchool = await prisma.school.create({
      data: { name: `Foreign School ${Date.now()}` },
    });

    try {
      const response = await app.inject({
        method: "POST",
        url: "/classes",
        headers: { authorization: `Bearer ${accessToken}` },
        payload: {
          schoolId: foreignSchool.id,
          name: "Intruder-A",
          academicYear: "2025-26",
        },
      });

      expect(response.statusCode).toBe(403);
      expect((response.json() as { error: string }).error).toMatch(/school/i);
    } finally {
      await prisma.school.delete({ where: { id: foreignSchool.id } });
    }
  });

  it("rejects duplicate class name in the same school/year", async () => {
    const first = await app.inject({
      method: "POST",
      url: "/classes",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        schoolId,
        name: "7-B",
        academicYear: "2025-26",
      },
    });
    classIds.push((first.json() as { id: string }).id);

    const second = await app.inject({
      method: "POST",
      url: "/classes",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        schoolId,
        name: "7-B",
        academicYear: "2025-26",
      },
    });

    expect(second.statusCode).toBe(409);
  });

  it("does not 500 when two classes import the same new roll at once", async () => {
    const otherEmail = uniqueEmail("race-teacher");
    emails.push(otherEmail);
    const registered = await app.inject({
      method: "POST",
      url: "/auth/register",
      payload: {
        name: "Race Teacher",
        email: otherEmail,
        password: "Password123!",
      },
    });
    const otherAccess = (registered.json() as { accessToken: string })
      .accessToken;
    await grantSchoolMembership(otherEmail, schoolId);

    const firstClass = await app.inject({
      method: "POST",
      url: "/classes",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        schoolId,
        name: `Race-A-${Date.now().toString(36)}`,
        academicYear: "2025-26",
      },
    });
    const secondClass = await app.inject({
      method: "POST",
      url: "/classes",
      headers: { authorization: `Bearer ${otherAccess}` },
      payload: {
        schoolId,
        name: `Race-B-${Date.now().toString(36)}`,
        academicYear: "2025-26",
      },
    });
    const classA = (firstClass.json() as { id: string }).id;
    const classB = (secondClass.json() as { id: string }).id;
    classIds.push(classA, classB);

    const [left, right] = await Promise.all([
      app.inject({
        method: "POST",
        url: `/classes/${classA}/students/import`,
        headers: { authorization: `Bearer ${accessToken}` },
        payload: { csv: "rollNumber,name\n88,From A\n" },
      }),
      app.inject({
        method: "POST",
        url: `/classes/${classB}/students/import`,
        headers: { authorization: `Bearer ${otherAccess}` },
        payload: { csv: "rollNumber,name\n88,From B\n" },
      }),
    ]);

    expect(left.statusCode).toBe(200);
    expect(right.statusCode).toBe(200);
    const results = [left.json(), right.json()] as Array<{ imported: number }>;
    expect(results.filter((result) => result.imported === 1)).toHaveLength(1);

    const students = await prisma.student.findMany({
      where: { schoolId, rollNumber: 88 },
    });
    expect(students).toHaveLength(1);
    expect(["From A", "From B"]).toContain(students[0]?.name);
  });
});
