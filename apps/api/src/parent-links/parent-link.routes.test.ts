import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { toKolkataCalendarDate } from "@classroom-tracker/shared";
import { loadEnv } from "../load-env.js";
import { buildApp } from "../app.js";
import { prisma } from "../db.js";
import {
  deleteUsersByEmail,
  grantClassTeacherMembership,
} from "../test/school-member.js";

loadEnv();

function uniqueEmail(label: string): string {
  return `${label}.${Date.now()}.${Math.random().toString(16).slice(2)}@test.local`;
}

describe("parent link routes", () => {
  let app: FastifyInstance;
  let schoolId: string;
  let classId: string;
  let subjectId: string;
  let accessToken: string;
  let otherToken: string;
  let studentId: string;
  const emails: string[] = [];

  beforeAll(async () => {
    app = await buildApp({ logger: false });
    await app.ready();

    const school = await prisma.school.create({
      data: { name: `Parent Link School ${Date.now()}` },
    });
    schoolId = school.id;

    const email = uniqueEmail("plink-teacher");
    const otherEmail = uniqueEmail("plink-other");
    emails.push(email, otherEmail);

    accessToken = (
      await app.inject({
        method: "POST",
        url: "/auth/register",
        payload: {
          name: "Link Teacher",
          email,
          password: "Password123!",
        },
      })
    ).json().accessToken as string;

    otherToken = (
      await app.inject({
        method: "POST",
        url: "/auth/register",
        payload: {
          name: "Other Link",
          email: otherEmail,
          password: "Password123!",
        },
      })
    ).json().accessToken as string;

    await grantClassTeacherMembership(email, schoolId);

    classId = (
      await app.inject({
        method: "POST",
        url: "/classes",
        headers: { authorization: `Bearer ${accessToken}` },
        payload: {
          schoolId,
          name: "8-P",
          academicYear: "2025-26",
          subjectName: "English",
        },
      })
    ).json().id as string;

    subjectId = (
      await prisma.teacherClassSubject.findFirstOrThrow({ where: { classId } })
    ).subjectId;

    await app.inject({
      method: "POST",
      url: `/classes/${classId}/students/import`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { csv: "rollNumber,name\n1,Parent Kid\n" },
    });

    studentId = (
      await prisma.student.findFirstOrThrow({
        where: { schoolId },
        orderBy: { rollNumber: "asc" },
      })
    ).id;

    const today = toKolkataCalendarDate(new Date());
    await app.inject({
      method: "POST",
      url: `/classes/${classId}/tasks`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        subjectId,
        type: "DAILY_HOMEWORK",
        title: "Parent HW",
        assignedOn: today,
        dueOn: today,
      },
    });

    await prisma.taskStatus.updateMany({
      where: { studentId, task: { classId } },
      data: { status: "DONE" },
    });
  });

  afterAll(async () => {
    await prisma.parentLink
      .deleteMany({ where: { classId } })
      .catch(() => undefined);
    await prisma.task.deleteMany({ where: { classId } }).catch(() => undefined);
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

  it("creates a link, serves the public report, and rotates the token", async () => {
    const created = await app.inject({
      method: "POST",
      url: `/classes/${classId}/students/${studentId}/parent-link`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {},
    });
    expect(created.statusCode).toBe(201);
    const first = created.json() as {
      token: string;
      path: string;
      active: boolean;
    };
    expect(first.active).toBe(true);
    expect(first.path).toBe(`/p/${first.token}`);
    expect(first.token.length).toBeGreaterThanOrEqual(32);

    const publicReport = await app.inject({
      method: "GET",
      url: `/parent/${first.token}/report?days=30`,
    });
    expect(publicReport.statusCode).toBe(200);
    const body = publicReport.json() as {
      student: { id: string };
      summary: { doneCount: number; totalTasks: number };
    };
    expect(body.student.id).toBe(studentId);
    expect(body.summary.totalTasks).toBe(1);
    expect(body.summary.doneCount).toBe(1);

    const status = await app.inject({
      method: "GET",
      url: `/classes/${classId}/students/${studentId}/parent-link`,
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(status.statusCode).toBe(200);
    expect(status.json().link?.active).toBe(true);
    expect(status.json().link?.token).toBeUndefined();

    const rotated = await app.inject({
      method: "POST",
      url: `/classes/${classId}/students/${studentId}/parent-link`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { expiresInDays: 30 },
    });
    expect(rotated.statusCode).toBe(201);
    const second = rotated.json() as { token: string };
    expect(second.token).not.toBe(first.token);

    const oldDenied = await app.inject({
      method: "GET",
      url: `/parent/${first.token}/report`,
    });
    expect(oldDenied.statusCode).toBe(404);

    const newOk = await app.inject({
      method: "GET",
      url: `/parent/${second.token}/report`,
    });
    expect(newOk.statusCode).toBe(200);
  });

  it("revokes the link and blocks public access", async () => {
    const created = await app.inject({
      method: "POST",
      url: `/classes/${classId}/students/${studentId}/parent-link`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {},
    });
    const token = (created.json() as { token: string }).token;

    const revoked = await app.inject({
      method: "DELETE",
      url: `/classes/${classId}/students/${studentId}/parent-link`,
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(revoked.statusCode).toBe(200);
    expect(revoked.json().link?.active).toBe(false);

    const denied = await app.inject({
      method: "GET",
      url: `/parent/${token}/report`,
    });
    expect(denied.statusCode).toBe(404);
  });

  it("forbids another teacher from managing the link", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/classes/${classId}/students/${studentId}/parent-link`,
      headers: { authorization: `Bearer ${otherToken}` },
      payload: {},
    });
    expect([403, 404]).toContain(res.statusCode);
  });

  it("rejects invalid public days", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/parent/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/report?days=0",
    });
    expect(res.statusCode).toBe(400);
  });

  it("downloads the public report as CSV", async () => {
    const created = await app.inject({
      method: "POST",
      url: `/classes/${classId}/students/${studentId}/parent-link`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {},
    });
    const token = (created.json() as { token: string }).token;

    const res = await app.inject({
      method: "GET",
      url: `/parent/${token}/report.csv?days=30`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toMatch(/text\/csv/);
    expect(res.body).toContain("Parent HW");
    expect(res.body).toContain("Homework");
    expect(res.body).toContain("Done");
  });
});
