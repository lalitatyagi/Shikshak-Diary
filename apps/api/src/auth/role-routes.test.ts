import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { Role } from "@prisma/client";
import { toKolkataCalendarDate } from "@classroom-tracker/shared";
import { loadEnv } from "../load-env.js";
import { buildApp } from "../app.js";
import { prisma } from "../db.js";
import { hashPassword } from "./password.js";
import {
  deleteUsersByEmail,
  grantClassTeacherMembership,
} from "../test/school-member.js";

loadEnv();

function uniqueEmail(label: string): string {
  return `${label}.${Date.now()}.${Math.random().toString(16).slice(2)}@test.local`;
}

describe("role checks on class, task, and status routes", () => {
  let app: FastifyInstance;
  let schoolId: string;
  let classId: string;
  let parentToken: string;
  const emails: string[] = [];

  beforeAll(async () => {
    app = await buildApp({ logger: false });
    await app.ready();

    const adminEmail = uniqueEmail("role-admin");
    const teacherEmail = uniqueEmail("role-teacher");
    const parentEmail = uniqueEmail("role-parent");
    emails.push(adminEmail, teacherEmail, parentEmail);
    const passwordHash = await hashPassword("Password123!");

    await prisma.user.create({
      data: {
        name: "Role Admin",
        email: adminEmail,
        passwordHash,
        role: Role.ADMIN,
      },
    });
    await prisma.user.create({
      data: {
        name: "Role Parent",
        email: parentEmail,
        passwordHash,
        role: Role.PARENT,
      },
    });

    const adminLogin = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: adminEmail, password: "Password123!" },
    });
    const adminToken = (adminLogin.json() as { accessToken: string })
      .accessToken;

    const createdSchool = await app.inject({
      method: "POST",
      url: "/schools",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { name: `Role School ${Date.now()}` },
    });
    expect(createdSchool.statusCode).toBe(201);
    schoolId = (createdSchool.json() as { id: string }).id;

    const teacher = await app.inject({
      method: "POST",
      url: "/auth/register",
      payload: {
        name: "Role Teacher",
        email: teacherEmail,
        password: "Password123!",
      },
    });
    const teacherToken = (teacher.json() as { accessToken: string })
      .accessToken;
    await grantClassTeacherMembership(teacherEmail, schoolId);

    const deniedSchool = await app.inject({
      method: "POST",
      url: "/schools",
      headers: { authorization: `Bearer ${teacherToken}` },
      payload: { name: "Should not exist" },
    });
    expect(deniedSchool.statusCode).toBe(403);

    const today = toKolkataCalendarDate(new Date());
    const createdClass = await app.inject({
      method: "POST",
      url: "/classes",
      headers: { authorization: `Bearer ${teacherToken}` },
      payload: {
        schoolId,
        name: "8-R",
        academicYear: "2025-26",
        subjectName: "Math",
      },
    });
    classId = (createdClass.json() as { id: string }).id;

    const subjectId = (
      await prisma.teacherClassSubject.findFirstOrThrow({ where: { classId } })
    ).subjectId;
    await app.inject({
      method: "POST",
      url: `/classes/${classId}/tasks`,
      headers: { authorization: `Bearer ${teacherToken}` },
      payload: {
        subjectId,
        type: "DAILY_HOMEWORK",
        title: "HW",
        assignedOn: today,
        dueOn: today,
      },
    });

    const parentLogin = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: parentEmail, password: "Password123!" },
    });
    parentToken = (parentLogin.json() as { accessToken: string }).accessToken;
  });

  afterAll(async () => {
    if (classId) {
      await prisma.class
        .deleteMany({ where: { id: classId } })
        .catch(() => undefined);
    }
    if (schoolId) {
      await prisma.school
        .delete({ where: { id: schoolId } })
        .catch(() => undefined);
    }
    await deleteUsersByEmail(emails);
    await app.close();
    await prisma.$disconnect();
  });

  it("denies a parent on class, task, and status routes", async () => {
    const headers = { authorization: `Bearer ${parentToken}` };
    const classes = await app.inject({
      method: "GET",
      url: "/classes",
      headers,
    });
    const tasks = await app.inject({
      method: "GET",
      url: `/classes/${classId}/tasks`,
      headers,
    });
    const grid = await app.inject({
      method: "GET",
      url: `/classes/${classId}/grid`,
      headers,
    });
    const markAll = await app.inject({
      method: "POST",
      url: "/tasks/missing/mark-all-complete",
      headers,
    });

    expect(classes.statusCode).toBe(403);
    expect(tasks.statusCode).toBe(403);
    expect(grid.statusCode).toBe(403);
    expect(markAll.statusCode).toBe(403);
  });
});
