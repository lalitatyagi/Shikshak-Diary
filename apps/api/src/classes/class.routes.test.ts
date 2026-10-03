import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { loadEnv } from "../load-env.js";
import { buildApp } from "../app.js";
import { prisma } from "../db.js";

loadEnv();

function uniqueEmail(label: string): string {
  return `${label}.${Date.now()}.${Math.random().toString(16).slice(2)}@test.local`;
}

describe("class routes", () => {
  let app: FastifyInstance;
  let schoolId: string;
  let accessToken: string;
  let otherToken: string;
  const emails: string[] = [];
  const classIds: string[] = [];

  beforeAll(async () => {
    app = await buildApp({ logger: false });
    await app.ready();

    const school = await prisma.school.create({
      data: { name: `Test School ${Date.now()}` },
    });
    schoolId = school.id;

    const teacherEmail = uniqueEmail("class-teacher");
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
  });

  afterAll(async () => {
    if (classIds.length > 0) {
      await prisma.class.deleteMany({ where: { id: { in: classIds } } });
    }
    await prisma.school
      .delete({ where: { id: schoolId } })
      .catch(() => undefined);
    if (emails.length > 0) {
      await prisma.user.deleteMany({ where: { email: { in: emails } } });
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
    expect((students.json() as unknown[]).length).toBe(2);
  });

  it("forbids another teacher from importing into an unassigned class", async () => {
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

    const response = await app.inject({
      method: "POST",
      url: `/classes/${classId}/students/import`,
      headers: { authorization: `Bearer ${otherToken}` },
      payload: {
        csv: "rollNumber,name\n1,Someone\n",
      },
    });

    expect(response.statusCode).toBe(403);
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
});
