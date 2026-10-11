import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { toKolkataCalendarDate } from "@classroom-tracker/shared";
import { loadEnv } from "../load-env.js";
import { buildApp } from "../app.js";
import { prisma } from "../db.js";
import { hashPassword } from "../auth/password.js";
import {
  deleteUsersByEmail,
  grantSchoolMembership,
} from "../test/school-member.js";

loadEnv();

function uniqueEmail(label: string): string {
  return `${label}.${Date.now()}.${Math.random().toString(16).slice(2)}@test.local`;
}

describe("tick grid status routes", () => {
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
      data: { name: `Grid School ${Date.now()}` },
    });
    schoolId = school.id;

    const email = uniqueEmail("grid-teacher");
    const otherEmail = uniqueEmail("grid-other");
    emails.push(email, otherEmail);

    accessToken = (
      await app.inject({
        method: "POST",
        url: "/auth/register",
        payload: {
          name: "Grid Teacher",
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
          name: "Other Grid",
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
          name: "8-G",
          academicYear: "2025-26",
          subjectName: "Math",
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
        csv: "rollNumber,name\n1,One\n2,Two\n",
      },
    });

    const today = toKolkataCalendarDate(new Date());
    await app.inject({
      method: "POST",
      url: `/classes/${classId}/tasks`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        subjectId,
        type: "DAILY_HOMEWORK",
        title: "HW1",
        assignedOn: today,
        dueOn: today,
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
    await deleteUsersByEmail(emails);
    await app.close();
    await prisma.$disconnect();
  });

  it("filters the grid by task type and student search", async () => {
    const byType = await app.inject({
      method: "GET",
      url: `/classes/${classId}/grid?type=NOTEBOOK_CHECK`,
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(byType.statusCode).toBe(200);
    expect((byType.json() as { tasks: unknown[] }).tasks).toHaveLength(0);

    const byStudent = await app.inject({
      method: "GET",
      url: `/classes/${classId}/grid?q=One`,
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(byStudent.statusCode).toBe(200);
    const filtered = byStudent.json() as {
      students: Array<{ name: string }>;
      statuses: unknown[];
    };
    expect(filtered.students).toHaveLength(1);
    expect(filtered.students[0]!.name).toBe("One");
    expect(filtered.statuses).toHaveLength(1);
  });

  it("returns a class grid and updates a cell via PUT", async () => {
    const gridRes = await app.inject({
      method: "GET",
      url: `/classes/${classId}/grid`,
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(gridRes.statusCode).toBe(200);
    const grid = gridRes.json() as {
      defaultSubjectId: string;
      students: unknown[];
      tasks: unknown[];
      statuses: Array<{ id: string; status: string; version: number }>;
    };
    expect(grid.defaultSubjectId).toBe(subjectId);
    expect(grid.students).toHaveLength(2);
    expect(grid.tasks).toHaveLength(1);
    expect(grid.statuses).toHaveLength(2);

    const cell = grid.statuses[0]!;
    expect(cell.status).toBe("PENDING");

    const updated = await app.inject({
      method: "PUT",
      url: `/task-statuses/${cell.id}`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { status: "DONE", version: cell.version },
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json()).toMatchObject({
      status: "DONE",
      version: cell.version + 1,
    });
    const audit = await prisma.auditLog.findFirst({
      where: { entity: "TaskStatus", entityId: cell.id, action: "update" },
    });
    expect(audit).toBeTruthy();
  });

  it("stores marks on a WEEKLY_TEST and rejects scores above maxMarks", async () => {
    const today = toKolkataCalendarDate(new Date());
    const created = await app.inject({
      method: "POST",
      url: `/classes/${classId}/tasks`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        subjectId,
        type: "WEEKLY_TEST",
        title: "Ch1 test",
        assignedOn: today,
        dueOn: today,
        maxMarks: 10,
      },
    });
    expect(created.statusCode).toBe(201);
    const taskId = (created.json() as { id: string }).id;

    const grid = (
      await app.inject({
        method: "GET",
        url: `/classes/${classId}/grid`,
        headers: { authorization: `Bearer ${accessToken}` },
      })
    ).json() as {
      tasks: Array<{ id: string; maxMarks: number | null }>;
      statuses: Array<{
        id: string;
        taskId: string;
        version: number;
        marks: number | null;
      }>;
    };
    const task = grid.tasks.find((row) => row.id === taskId);
    expect(task?.maxMarks).toBe(10);
    const cell = grid.statuses.find((row) => row.taskId === taskId)!;

    const tooHigh = await app.inject({
      method: "PUT",
      url: `/task-statuses/${cell.id}`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { status: "DONE", version: cell.version, marks: 11 },
    });
    expect(tooHigh.statusCode).toBe(400);

    const ok = await app.inject({
      method: "PUT",
      url: `/task-statuses/${cell.id}`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { status: "DONE", version: cell.version, marks: 8 },
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.json()).toMatchObject({ status: "DONE", marks: 8 });
  });

  it("rejects stale version on PUT", async () => {
    const grid = (
      await app.inject({
        method: "GET",
        url: `/classes/${classId}/grid`,
        headers: { authorization: `Bearer ${accessToken}` },
      })
    ).json() as { statuses: Array<{ id: string; version: number }> };

    const cell = grid.statuses[0]!;
    const first = await app.inject({
      method: "PUT",
      url: `/task-statuses/${cell.id}`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { status: "NOT_DONE", version: cell.version },
    });
    expect(first.statusCode).toBe(200);

    const stale = await app.inject({
      method: "PUT",
      url: `/task-statuses/${cell.id}`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { status: "DONE", version: cell.version },
    });
    expect(stale.statusCode).toBe(409);
  });

  it("mark-all-complete only updates PENDING cells", async () => {
    const grid = (
      await app.inject({
        method: "GET",
        url: `/classes/${classId}/grid`,
        headers: { authorization: `Bearer ${accessToken}` },
      })
    ).json() as {
      tasks: Array<{ id: string }>;
      statuses: Array<{
        id: string;
        taskId: string;
        version: number;
        studentId: string;
      }>;
    };

    const taskId = grid.tasks[0]!.id;
    const forTask = grid.statuses.filter((row) => row.taskId === taskId);
    const keep = forTask[0]!;
    const pending = forTask[1]!;
    expect(forTask.length).toBeGreaterThanOrEqual(2);

    await prisma.taskStatus.update({
      where: { id: keep.id },
      data: { status: "NOT_DONE", version: keep.version + 10 },
    });
    await prisma.taskStatus.update({
      where: { id: pending.id },
      data: { status: "PENDING" },
    });

    const bulk = await app.inject({
      method: "POST",
      url: `/tasks/${taskId}/mark-all-complete`,
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(bulk.statusCode).toBe(200);
    expect(bulk.json()).toMatchObject({ status: "DONE", updated: 1 });

    const kept = await prisma.taskStatus.findUniqueOrThrow({
      where: { id: keep.id },
    });
    const filled = await prisma.taskStatus.findUniqueOrThrow({
      where: { id: pending.id },
    });
    expect(kept.status).toBe("NOT_DONE");
    expect(filled.status).toBe("DONE");
  });

  it("forbids another teacher from grid, status PUT, and mark-all", async () => {
    const grid = await app.inject({
      method: "GET",
      url: `/classes/${classId}/grid`,
      headers: { authorization: `Bearer ${otherToken}` },
    });
    expect([403, 404]).toContain(grid.statusCode);

    const ownerGrid = (
      await app.inject({
        method: "GET",
        url: `/classes/${classId}/grid`,
        headers: { authorization: `Bearer ${accessToken}` },
      })
    ).json() as {
      tasks: Array<{ id: string }>;
      statuses: Array<{ id: string; version: number }>;
    };

    const put = await app.inject({
      method: "PUT",
      url: `/task-statuses/${ownerGrid.statuses[0]!.id}`,
      headers: { authorization: `Bearer ${otherToken}` },
      payload: {
        status: "DONE",
        version: ownerGrid.statuses[0]!.version,
      },
    });
    expect([403, 404]).toContain(put.statusCode);

    const markAll = await app.inject({
      method: "POST",
      url: `/tasks/${ownerGrid.tasks[0]!.id}/mark-all-complete`,
      headers: { authorization: `Bearer ${otherToken}` },
    });
    expect([403, 404]).toContain(markAll.statusCode);
  });

  it("returns 409 when two updates race on the same version", async () => {
    const grid = (
      await app.inject({
        method: "GET",
        url: `/classes/${classId}/grid`,
        headers: { authorization: `Bearer ${accessToken}` },
      })
    ).json() as { statuses: Array<{ id: string; version: number }> };
    const cell = grid.statuses[0]!;

    const [first, second] = await Promise.all([
      app.inject({
        method: "PUT",
        url: `/task-statuses/${cell.id}`,
        headers: { authorization: `Bearer ${accessToken}` },
        payload: { status: "DONE", version: cell.version },
      }),
      app.inject({
        method: "PUT",
        url: `/task-statuses/${cell.id}`,
        headers: { authorization: `Bearer ${accessToken}` },
        payload: { status: "NOT_DONE", version: cell.version },
      }),
    ]);

    const codes = [first.statusCode, second.statusCode].sort();
    expect(codes).toEqual([200, 409]);
  });

  it("lets an admin open the grid when the class has no teacher assignment", async () => {
    await prisma.teacherClassSubject.deleteMany({ where: { classId } });

    const adminEmail = uniqueEmail("grid-admin");
    emails.push(adminEmail);
    await prisma.user.create({
      data: {
        name: "Grid Admin",
        email: adminEmail,
        passwordHash: await hashPassword("Password123!"),
        role: "ADMIN",
      },
    });
    const login = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: adminEmail, password: "Password123!" },
    });
    const adminToken = (login.json() as { accessToken: string }).accessToken;

    const grid = await app.inject({
      method: "GET",
      url: `/classes/${classId}/grid`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(grid.statusCode).toBe(200);

    const subject = await prisma.subject.findFirstOrThrow({
      where: { schoolId },
      orderBy: [{ name: "asc" }, { id: "asc" }],
    });
    expect((grid.json() as { defaultSubjectId: string }).defaultSubjectId).toBe(
      subject.id,
    );
  });
});
