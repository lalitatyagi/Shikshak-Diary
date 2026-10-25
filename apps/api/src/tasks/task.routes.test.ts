import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import {
  kolkataCalendarDateToInstant,
  startOfTodayKolkata,
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

describe("task routes", () => {
  let app: FastifyInstance;
  let schoolId: string;
  let classId: string;
  let subjectId: string;
  let accessToken: string;
  let otherToken: string;
  const emails: string[] = [];

  beforeAll(async () => {
    app = await buildApp({ logger: false });
    await app.ready();

    const school = await prisma.school.create({
      data: { name: `Task School ${Date.now()}` },
    });
    schoolId = school.id;

    const email = uniqueEmail("task-teacher");
    const otherEmail = uniqueEmail("other-task-teacher");
    emails.push(email, otherEmail);

    const register = await registerVerifiedTeacher(app, {
      name: "Task Teacher",
      email,
      password: "Password123!",
    });
    accessToken = (register.json() as { accessToken: string }).accessToken;

    const otherRegister = await registerVerifiedTeacher(app, {
      name: "Other Task Teacher",
      email: otherEmail,
      password: "Password123!",
    });
    otherToken = (otherRegister.json() as { accessToken: string }).accessToken;

    await grantClassTeacherMembership(email, schoolId);

    const createdClass = await app.inject({
      method: "POST",
      url: "/classes",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        schoolId,
        name: "8-T",
        academicYear: "2025-26",
        subjectName: "Mathematics",
      },
    });
    classId = (createdClass.json() as { id: string }).id;

    const assignment = await prisma.teacherClassSubject.findFirstOrThrow({
      where: { classId },
    });
    subjectId = assignment.subjectId;

    await app.inject({
      method: "POST",
      url: `/classes/${classId}/students/import`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        csv: [
          "rollNumber,name,parentContact",
          "1,Student One,",
          "2,Student Two,",
          "3,Student Three,",
        ].join("\n"),
      },
    });
  });

  afterAll(async () => {
    await prisma.class
      .deleteMany({ where: { id: classId } })
      .catch(() => undefined);
    await prisma.school
      .delete({ where: { id: schoolId } })
      .catch(() => undefined);
    if (emails.length > 0) {
      await deleteUsersByEmail(emails);
    }
    await app.close();
    await prisma.$disconnect();
  });

  it("creates DAILY_HOMEWORK with PENDING status for every enrolled student", async () => {
    const response = await app.inject({
      method: "POST",
      url: `/classes/${classId}/tasks`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        subjectId,
        type: "DAILY_HOMEWORK",
        title: "Exercise 1.1",
        description: "Page 12",
        assignedOn: "2026-10-03",
        dueOn: "2026-10-04",
      },
    });

    expect(response.statusCode).toBe(201);
    const body = response.json() as {
      id: string;
      type: string;
      statusCount: number;
      assignedOn: string;
      dueOn: string;
      maxMarks: number | null;
      totalParts: number | null;
    };
    expect(body.type).toBe("DAILY_HOMEWORK");
    expect(body.statusCount).toBe(3);
    expect(body.assignedOn).toBe("2026-10-03");
    expect(body.dueOn).toBe("2026-10-04");
    expect(body.maxMarks).toBeNull();
    expect(body.totalParts).toBeNull();

    const statuses = await prisma.taskStatus.findMany({
      where: { taskId: body.id },
    });
    expect(statuses).toHaveLength(3);
    expect(statuses.every((status) => status.status === "PENDING")).toBe(true);
  });

  it("creates NOTEBOOK_CHECK with PENDING statuses in one shot", async () => {
    const response = await app.inject({
      method: "POST",
      url: `/classes/${classId}/tasks`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        subjectId,
        type: "NOTEBOOK_CHECK",
        title: "Notebook check — Unit 1",
        assignedOn: "2026-10-03",
        dueOn: "2026-10-03",
      },
    });

    expect(response.statusCode).toBe(201);
    const body = response.json() as { id: string; statusCount: number };
    expect(body.statusCount).toBe(3);

    const pendingCount = await prisma.taskStatus.count({
      where: { taskId: body.id, status: "PENDING" },
    });
    expect(pendingCount).toBe(3);
  });

  it("creates ATTENDANCE with PENDING statuses for the class", async () => {
    const response = await app.inject({
      method: "POST",
      url: `/classes/${classId}/tasks`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        subjectId,
        type: "ATTENDANCE",
        title: "Attendance 2026-10-03",
        assignedOn: "2026-10-03",
        dueOn: "2026-10-03",
      },
    });

    expect(response.statusCode).toBe(201);
    const body = response.json() as {
      id: string;
      type: string;
      statusCount: number;
    };
    expect(body.type).toBe("ATTENDANCE");
    expect(body.statusCount).toBe(3);
  });

  it("creates WEEKLY_TEST and HOLIDAY_HOMEWORK with typed fields", async () => {
    const weekly = await app.inject({
      method: "POST",
      url: `/classes/${classId}/tasks`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        subjectId,
        type: "WEEKLY_TEST",
        title: "Unit test",
        assignedOn: "2026-10-03",
        dueOn: "2026-10-03",
        maxMarks: 20,
      },
    });
    expect(weekly.statusCode).toBe(201);
    expect(weekly.json()).toMatchObject({
      type: "WEEKLY_TEST",
      maxMarks: 20,
      totalParts: null,
      statusCount: 3,
    });

    const holiday = await app.inject({
      method: "POST",
      url: `/classes/${classId}/tasks`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        subjectId,
        type: "HOLIDAY_HOMEWORK",
        title: "Holiday pack",
        assignedOn: "2026-10-03",
        dueOn: "2026-10-10",
        totalParts: 5,
      },
    });
    expect(holiday.statusCode).toBe(201);
    expect(holiday.json()).toMatchObject({
      type: "HOLIDAY_HOMEWORK",
      maxMarks: null,
      totalParts: 5,
    });

    const withMarks = await app.inject({
      method: "POST",
      url: `/classes/${classId}/tasks`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        subjectId,
        type: "DAILY_HOMEWORK",
        title: "Should fail",
        assignedOn: "2026-10-03",
        dueOn: "2026-10-04",
        maxMarks: 10,
      },
    });
    expect(withMarks.statusCode).toBe(400);
  });

  it("lists tasks for the class", async () => {
    const response = await app.inject({
      method: "GET",
      url: `/classes/${classId}/tasks`,
      headers: { authorization: `Bearer ${accessToken}` },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json() as {
      items: Array<{ statusCount: number; type: string }>;
      total: number;
    };
    expect(body.items.length).toBeGreaterThanOrEqual(2);
    expect(body.total).toBeGreaterThanOrEqual(2);

    const filtered = await app.inject({
      method: "GET",
      url: `/classes/${classId}/tasks?type=DAILY_HOMEWORK`,
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(filtered.statusCode).toBe(200);
    const daily = filtered.json() as {
      items: Array<{ type: string }>;
    };
    expect(daily.items.every((task) => task.type === "DAILY_HOMEWORK")).toBe(
      true,
    );
  });

  it("forbids another teacher from listing or fetching tasks for an unassigned class", async () => {
    const created = await app.inject({
      method: "POST",
      url: `/classes/${classId}/tasks`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        subjectId,
        type: "DAILY_HOMEWORK",
        title: "Access control task",
        assignedOn: toKolkataCalendarDate(new Date()),
        dueOn: toKolkataCalendarDate(new Date()),
      },
    });
    expect(created.statusCode).toBe(201);
    const taskId = (created.json() as { id: string }).id;

    const list = await app.inject({
      method: "GET",
      url: `/classes/${classId}/tasks`,
      headers: { authorization: `Bearer ${otherToken}` },
    });
    expect([403, 404]).toContain(list.statusCode);

    const getOne = await app.inject({
      method: "GET",
      url: `/tasks/${taskId}`,
      headers: { authorization: `Bearer ${otherToken}` },
    });
    expect([403, 404]).toContain(getOne.statusCode);
  });

  it("creates PENDING rows for open tasks when a student is imported later", async () => {
    const today = toKolkataCalendarDate(new Date());
    const yesterday = toKolkataCalendarDate(
      new Date(startOfTodayKolkata().getTime() - 24 * 60 * 60 * 1000),
    );

    const openTask = await app.inject({
      method: "POST",
      url: `/classes/${classId}/tasks`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        subjectId,
        type: "DAILY_HOMEWORK",
        title: "Still open",
        assignedOn: today,
        dueOn: today,
      },
    });
    expect(openTask.statusCode).toBe(201);
    const openTaskId = (openTask.json() as { id: string }).id;

    // Past-due task created directly so dueOn is yesterday in Kolkata
    const pastTask = await prisma.task.create({
      data: {
        classId,
        subjectId,
        createdById: (
          await prisma.teacherClassSubject.findFirstOrThrow({
            where: { classId },
          })
        ).teacherId,
        type: "DAILY_HOMEWORK",
        title: "Already past due",
        assignedOn: kolkataCalendarDateToInstant(yesterday),
        dueOn: kolkataCalendarDateToInstant(yesterday),
      },
    });

    const beforeOpen = await prisma.taskStatus.count({
      where: { taskId: openTaskId },
    });
    const beforePast = await prisma.taskStatus.count({
      where: { taskId: pastTask.id },
    });

    const imported = await app.inject({
      method: "POST",
      url: `/classes/${classId}/students/import`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        csv: "rollNumber,name\n99,Late Joiner\n",
      },
    });
    expect(imported.statusCode).toBe(200);

    const lateStudent = await prisma.student.findFirstOrThrow({
      where: { schoolId, rollNumber: 99 },
    });

    const openStatus = await prisma.taskStatus.findUnique({
      where: {
        taskId_studentId: {
          taskId: openTaskId,
          studentId: lateStudent.id,
        },
      },
    });
    expect(openStatus?.status).toBe("PENDING");
    expect(
      await prisma.taskStatus.count({ where: { taskId: openTaskId } }),
    ).toBe(beforeOpen + 1);

    const pastStatus = await prisma.taskStatus.findUnique({
      where: {
        taskId_studentId: {
          taskId: pastTask.id,
          studentId: lateStudent.id,
        },
      },
    });
    expect(pastStatus).toBeNull();
    expect(
      await prisma.taskStatus.count({ where: { taskId: pastTask.id } }),
    ).toBe(beforePast);
  });

  it("stores assignedOn/dueOn as Kolkata calendar midnights", async () => {
    const response = await app.inject({
      method: "POST",
      url: `/classes/${classId}/tasks`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        subjectId,
        type: "DAILY_HOMEWORK",
        title: "Date storage check",
        assignedOn: "2026-10-03",
        dueOn: "2026-10-03",
      },
    });
    expect(response.statusCode).toBe(201);
    const taskId = (response.json() as { id: string }).id;

    const stored = await prisma.task.findUniqueOrThrow({
      where: { id: taskId },
    });
    // Midnight IST, not UTC midnight
    expect(stored.assignedOn.toISOString()).toBe("2026-10-02T18:30:00.000Z");
    expect(stored.dueOn.toISOString()).toBe("2026-10-02T18:30:00.000Z");
    expect(toKolkataCalendarDate(stored.assignedOn)).toBe("2026-10-03");
  });

  it("gives a student imported during task creation a status row", async () => {
    const today = toKolkataCalendarDate(new Date());
    const [, imported] = await Promise.all([
      app.inject({
        method: "POST",
        url: `/classes/${classId}/tasks`,
        headers: { authorization: `Bearer ${accessToken}` },
        payload: {
          subjectId,
          type: "DAILY_HOMEWORK",
          title: `Race task ${Date.now().toString(36)}`,
          assignedOn: today,
          dueOn: today,
        },
      }),
      app.inject({
        method: "POST",
        url: `/classes/${classId}/students/import`,
        headers: { authorization: `Bearer ${accessToken}` },
        payload: { csv: "rollNumber,name\n77,Late Joiner\n" },
      }),
    ]);

    expect(imported.statusCode).toBe(200);
    const student = await prisma.student.findFirstOrThrow({
      where: { schoolId, rollNumber: 77 },
    });
    const openTasks = await prisma.task.findMany({
      where: { classId, dueOn: { gte: startOfTodayKolkata() } },
      select: { id: true },
    });
    const statusCount = await prisma.taskStatus.count({
      where: {
        studentId: student.id,
        taskId: { in: openTasks.map((task) => task.id) },
      },
    });
    expect(statusCount).toBe(openTasks.length);
  });
});
