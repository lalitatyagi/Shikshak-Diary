import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { loadEnv } from "../load-env.js";
import { buildApp } from "../app.js";
import { prisma } from "../db.js";
import { registerVerifiedTeacher } from "../test/register.js";
import {
  deleteUsersByEmail,
  grantClassTeacherMembership,
  insertClassForUser,
  grantSchoolMembership,
} from "../test/school-member.js";

loadEnv();

function uniqueEmail(label: string): string {
  return `${label}.${Date.now()}.${Math.random().toString(16).slice(2)}@test.local`;
}

describe("RBAC roster vs subject teacher", () => {
  let app: FastifyInstance;
  let schoolId: string;
  let classId: string;
  let classTeacherToken: string;
  let subjectTeacherToken: string;
  let studentId: string;
  const emails: string[] = [];

  beforeAll(async () => {
    app = await buildApp({ logger: false });
    await app.ready();

    const school = await prisma.school.create({
      data: { name: `RBAC School ${Date.now()}` },
    });
    schoolId = school.id;

    const classTeacherEmail = uniqueEmail("rbac-ct");
    const subjectEmail = uniqueEmail("rbac-subj");
    emails.push(classTeacherEmail, subjectEmail);

    classTeacherToken = (
      await registerVerifiedTeacher(app, {
        name: "Class Teacher",
        email: classTeacherEmail,
        password: "Password123!",
      })
    ).json().accessToken as string;

    subjectTeacherToken = (
      await registerVerifiedTeacher(app, {
        name: "Subject Teacher",
        email: subjectEmail,
        password: "Password123!",
      })
    ).json().accessToken as string;

    await grantClassTeacherMembership(classTeacherEmail, schoolId);
    await grantSchoolMembership(subjectEmail, schoolId);

    const createdClass = await insertClassForUser({
      email: classTeacherEmail,
      schoolId,
      name: "8-RBAC",
      academicYear: "2025-26",
      subjectName: "Math",
    });
    classId = createdClass.id;

    // Assign subject teacher to the same class/subject.
    const subjectId = createdClass.subjectId;
    const subjectUser = await prisma.user.findUniqueOrThrow({
      where: { email: subjectEmail },
    });
    await prisma.teacherClassSubject.create({
      data: {
        teacherId: subjectUser.id,
        classId,
        subjectId,
      },
    });

    await app.inject({
      method: "POST",
      url: `/classes/${classId}/students/import`,
      headers: { authorization: `Bearer ${classTeacherToken}` },
      payload: { csv: "rollNumber,name\n1,Kid\n" },
    });
    studentId = (await prisma.student.findFirstOrThrow({ where: { schoolId } }))
      .id;
  });

  afterAll(async () => {
    await prisma.parentLink
      .deleteMany({ where: { classId } })
      .catch(() => undefined);
    await prisma.class
      .deleteMany({ where: { id: classId } })
      .catch(() => undefined);
    await prisma.school
      .delete({ where: { id: schoolId } })
      .catch(() => undefined);
    await deleteUsersByEmail(emails);
    await app.close();
    await prisma.$disconnect();
  });

  it("allows class teacher to import students", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/classes/${classId}/students/import`,
      headers: { authorization: `Bearer ${classTeacherToken}` },
      payload: { csv: "rollNumber,name\n2,Second\n" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().imported).toBe(1);
  });

  it("forbids a subject teacher from importing students", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/classes/${classId}/students/import`,
      headers: { authorization: `Bearer ${subjectTeacherToken}` },
      payload: { csv: "rollNumber,name\n3,Third\n" },
    });
    expect(res.statusCode).toBe(403);
  });

  it("forbids a subject teacher from creating parent links", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/classes/${classId}/students/${studentId}/parent-link`,
      headers: { authorization: `Bearer ${subjectTeacherToken}` },
      payload: {},
    });
    expect(res.statusCode).toBe(403);
  });

  it("still lets a subject teacher open the tick grid", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/classes/${classId}/grid`,
      headers: { authorization: `Bearer ${subjectTeacherToken}` },
    });
    expect(res.statusCode).toBe(200);
  });
});
