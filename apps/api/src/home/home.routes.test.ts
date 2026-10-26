import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import {
  kolkataCalendarDateToInstant,
  toKolkataCalendarDate,
} from "@classroom-tracker/shared";
import { loadEnv } from "../load-env.js";
import { buildApp } from "../app.js";
import { prisma } from "../db.js";
import { registerVerifiedTeacher } from "../test/register.js";
import {
  deleteUsersByEmail,
  grantClassTeacherMembership,
} from "../test/school-member.js";

loadEnv();

function uniqueEmail(label: string): string {
  return `${label}.${Date.now()}.${Math.random().toString(16).slice(2)}@test.local`;
}

describe("home routes", () => {
  let app: FastifyInstance;
  let schoolId: string;
  let classId: string;
  let accessToken: string;
  const emails: string[] = [];

  beforeAll(async () => {
    app = await buildApp({ logger: false });
    await app.ready();

    const school = await prisma.school.create({
      data: { name: `Home School ${Date.now()}` },
    });
    schoolId = school.id;

    const email = uniqueEmail("home-teacher");
    emails.push(email);

    accessToken = (
      await registerVerifiedTeacher(app, {
        name: "Home Teacher",
        email,
        password: "Password123!",
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
          name: "8-H",
          academicYear: "2025-26",
          subjectName: "Math",
        },
      })
    ).json().id as string;

    await app.inject({
      method: "POST",
      url: `/classes/${classId}/students/import`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        csv: "rollNumber,name\n1,One\n2,Two\n",
      },
    });

    const subjectId = (
      await prisma.teacherClassSubject.findFirstOrThrow({ where: { classId } })
    ).subjectId;
    const teacher = await prisma.user.findUniqueOrThrow({
      where: { email: email.toLowerCase() },
    });
    const today = toKolkataCalendarDate(new Date());
    const assignedOn = kolkataCalendarDateToInstant(today);

    await app.inject({
      method: "POST",
      url: `/classes/${classId}/tasks`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        subjectId,
        type: "DAILY_HOMEWORK",
        title: "Today HW",
        assignedOn: today,
        dueOn: today,
      },
    });

    // Mark one student NOT_DONE twice across two older tasks so they are a defaulter.
    const older = kolkataCalendarDateToInstant(
      toKolkataCalendarDate(new Date(Date.now() - 2 * 24 * 60 * 60 * 1000)),
    );
    const students = await prisma.student.findMany({
      where: { schoolId },
      orderBy: { rollNumber: "asc" },
    });

    for (let i = 0; i < 2; i += 1) {
      const task = await prisma.task.create({
        data: {
          classId,
          subjectId,
          createdById: teacher.id,
          type: "DAILY_HOMEWORK",
          title: `Miss ${i + 1}`,
          assignedOn: older,
          dueOn: older,
          statuses: {
            create: students.map((student) => ({
              studentId: student.id,
              status: student.rollNumber === 1 ? "NOT_DONE" : "DONE",
              updatedById: teacher.id,
            })),
          },
        },
      });
      void task;
    }

    await prisma.task.create({
      data: {
        classId,
        subjectId,
        createdById: teacher.id,
        type: "ATTENDANCE",
        title: `Attendance ${today}`,
        assignedOn,
        dueOn: assignedOn,
        statuses: {
          create: students.map((student) => ({
            studentId: student.id,
            status: student.rollNumber === 1 ? "ABSENT" : "DONE",
            updatedById: teacher.id,
          })),
        },
      },
    });

    // Score today's homework so homeworkDonePct is defined (1 DONE of 2).
    const todayHw = await prisma.task.findFirstOrThrow({
      where: { classId, title: "Today HW" },
    });
    await prisma.taskStatus.updateMany({
      where: { taskId: todayHw.id, student: { rollNumber: 2 } },
      data: { status: "DONE", updatedById: teacher.id },
    });
    await prisma.taskStatus.updateMany({
      where: { taskId: todayHw.id, student: { rollNumber: 1 } },
      data: { status: "NOT_DONE", updatedById: teacher.id },
    });
  });

  afterAll(async () => {
    await prisma.taskStatus.deleteMany({
      where: { task: { classId } },
    });
    await prisma.task.deleteMany({ where: { classId } });
    await prisma.enrollment.deleteMany({ where: { classId } });
    await prisma.teacherClassSubject.deleteMany({ where: { classId } });
    await prisma.class.deleteMany({ where: { id: classId } });
    await prisma.subject.deleteMany({ where: { schoolId } });
    await prisma.student.deleteMany({ where: { schoolId } });
    await prisma.schoolMember.deleteMany({ where: { schoolId } });
    await prisma.school.deleteMany({ where: { id: schoolId } });
    await deleteUsersByEmail(emails);
    await app.close();
    await prisma.$disconnect();
  });

  it("returns today tasks and defaulter counts for the teacher home", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/home",
      headers: { authorization: `Bearer ${accessToken}` },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json() as {
      today: string;
      classes: Array<{
        id: string;
        name: string;
        todayTasks: Array<{ title: string; pendingCount: number }>;
        pendingTodayCount: number;
        defaulterCount: number;
        attendancePresentPct: number | null;
        homeworkDonePct: number | null;
        topDefaulters: Array<{
          name: string;
          rollNumber: number;
          missCount: number;
        }>;
      }>;
    };
    expect(body.today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const card = body.classes.find((c) => c.id === classId);
    expect(card).toBeTruthy();
    expect(card!.name).toBe("8-H");
    expect(card!.todayTasks.some((t) => t.title === "Today HW")).toBe(true);
    expect(card!.defaulterCount).toBe(1);
    expect(card!.attendancePresentPct).toBe(50);
    // Older HW (1 DONE of 2 twice) + today HW (1 DONE of 2) → 3/6 = 50%
    expect(card!.homeworkDonePct).toBe(50);
    expect(card!.topDefaulters).toEqual([
      expect.objectContaining({ rollNumber: 1, missCount: 3, name: "One" }),
    ]);
  });

  it("rejects unauthenticated access", async () => {
    const response = await app.inject({ method: "GET", url: "/home" });
    expect(response.statusCode).toBe(401);
  });
});
