import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { toKolkataCalendarDate } from "@classroom-tracker/shared";
import { loadEnv } from "../load-env.js";
import { buildApp } from "../app.js";
import { prisma } from "../db.js";

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
    await prisma.user.deleteMany({ where: { email: { in: emails } } });
    await app.close();
    await prisma.$disconnect();
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
      statuses: Array<{ id: string; version: number; studentId: string }>;
    };

    const taskId = grid.tasks[0]!.id;
    const keep = grid.statuses[0]!;
    const pending = grid.statuses[1]!;

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
});
