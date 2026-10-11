import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { toKolkataCalendarDate } from "@classroom-tracker/shared";
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

describe("report routes", () => {
  let app: FastifyInstance;
  let schoolId: string;
  let classId: string;
  let subjectId: string;
  let accessToken: string;
  let otherToken: string;
  let studentId: string;
  let weeklyTaskId: string;
  const emails: string[] = [];

  beforeAll(async () => {
    app = await buildApp({ logger: false });
    await app.ready();

    const school = await prisma.school.create({
      data: { name: `Report School ${Date.now()}` },
    });
    schoolId = school.id;

    const email = uniqueEmail("report-teacher");
    const otherEmail = uniqueEmail("report-other");
    emails.push(email, otherEmail);

    accessToken = (
      await app.inject({
        method: "POST",
        url: "/auth/register",
        payload: {
          name: "Report Teacher",
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
          name: "Other Report",
          email: otherEmail,
          password: "Password123!",
        },
      })
    ).json().accessToken as string;

    await grantSchoolMembership(email, schoolId);

    classId = (
      await app.inject({
        method: "POST",
        url: "/classes",
        headers: { authorization: `Bearer ${accessToken}` },
        payload: {
          schoolId,
          name: "8-R",
          academicYear: "2025-26",
          subjectName: "Science",
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
      payload: {
        csv: "rollNumber,name\n1,Report Kid\n2,Other Kid\n",
      },
    });

    const students = await prisma.student.findMany({
      where: { schoolId },
      orderBy: { rollNumber: "asc" },
    });
    studentId = students[0]!.id;

    const today = toKolkataCalendarDate(new Date());

    await app.inject({
      method: "POST",
      url: `/classes/${classId}/tasks`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        subjectId,
        type: "DAILY_HOMEWORK",
        title: "HW report",
        assignedOn: today,
        dueOn: today,
      },
    });

    weeklyTaskId = (
      await app.inject({
        method: "POST",
        url: `/classes/${classId}/tasks`,
        headers: { authorization: `Bearer ${accessToken}` },
        payload: {
          subjectId,
          type: "WEEKLY_TEST",
          title: "Unit quiz",
          assignedOn: today,
          dueOn: today,
          maxMarks: 20,
        },
      })
    ).json().id as string;

    const statuses = await prisma.taskStatus.findMany({
      where: { studentId, task: { classId } },
    });
    const hw = statuses.find((row) => row.taskId !== weeklyTaskId);
    const quiz = statuses.find((row) => row.taskId === weeklyTaskId);
    expect(hw).toBeTruthy();
    expect(quiz).toBeTruthy();

    await prisma.taskStatus.update({
      where: { id: hw!.id },
      data: { status: "NOT_DONE" },
    });
    await prisma.taskStatus.update({
      where: { id: quiz!.id },
      data: { status: "DONE", marks: 17 },
    });
  });

  afterAll(async () => {
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

  it("returns summary counts and weekly average for one student", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/classes/${classId}/students/${studentId}/report?days=30`,
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      days: number;
      student: { id: string; rollNumber: number };
      summary: {
        totalTasks: number;
        doneCount: number;
        notDoneCount: number;
        weeklyTestCount: number;
        weeklyTestAvgMarks: number | null;
      };
      tasks: Array<{ taskId: string; marks: number | null }>;
    };
    expect(body.days).toBe(30);
    expect(body.student.id).toBe(studentId);
    expect(body.summary.totalTasks).toBe(2);
    expect(body.summary.doneCount).toBe(1);
    expect(body.summary.notDoneCount).toBe(1);
    expect(body.summary.weeklyTestCount).toBe(1);
    expect(body.summary.weeklyTestAvgMarks).toBe(17);
    expect(body.tasks.some((t) => t.taskId === weeklyTaskId && t.marks === 17))
      .toBe(true);
  });

  it("returns 404 when student is not enrolled", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/classes/${classId}/students/clxxxxxxxxxxxxxxxxxxxxxxx/report`,
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(res.statusCode).toBe(404);
  });

  it("forbids another teacher from viewing the report", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/classes/${classId}/students/${studentId}/report`,
      headers: { authorization: `Bearer ${otherToken}` },
    });
    expect([403, 404]).toContain(res.statusCode);
  });

  it("rejects invalid days", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/classes/${classId}/students/${studentId}/report?days=0`,
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(res.statusCode).toBe(400);
  });

  it("downloads the report as CSV", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/classes/${classId}/students/${studentId}/report.csv?days=30`,
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toMatch(/text\/csv/);
    expect(res.headers["content-disposition"]).toMatch(/attachment/);
    expect(res.body).toContain("rollNumber,name,");
    expect(res.body).toContain("Unit quiz");
    expect(res.body).toContain("17");
  });
});
