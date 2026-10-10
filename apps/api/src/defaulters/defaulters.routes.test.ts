import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import {
  addKolkataCalendarDays,
  defaultersWindow,
  kolkataCalendarDateToInstant,
  toKolkataCalendarDate,
} from "@classroom-tracker/shared";
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

describe("defaulters routes", () => {
  let app: FastifyInstance;
  let schoolId: string;
  let classId: string;
  let subjectId: string;
  let accessToken: string;
  let otherToken: string;
  let studentOneId: string;
  let studentTwoId: string;
  let studentThreeId: string;
  const emails: string[] = [];

  beforeAll(async () => {
    app = await buildApp({ logger: false });
    await app.ready();

    const school = await prisma.school.create({
      data: { name: `Defaulters School ${Date.now()}` },
    });
    schoolId = school.id;

    const email = uniqueEmail("def-teacher");
    const otherEmail = uniqueEmail("def-other");
    emails.push(email, otherEmail);

    accessToken = (
      await app.inject({
        method: "POST",
        url: "/auth/register",
        payload: {
          name: "Def Teacher",
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
          name: "Other Def",
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
          name: "8-D",
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
        csv: "rollNumber,name\n1,One\n2,Two\n3,Three\n",
      },
    });

    const students = await prisma.student.findMany({
      where: { schoolId },
      orderBy: { rollNumber: "asc" },
    });
    studentOneId = students[0]!.id;
    studentTwoId = students[1]!.id;
    studentThreeId = students[2]!.id;

    const today = toKolkataCalendarDate(new Date());
    for (const title of ["HW A", "HW B"]) {
      await app.inject({
        method: "POST",
        url: `/classes/${classId}/tasks`,
        headers: { authorization: `Bearer ${accessToken}` },
        payload: {
          subjectId,
          type: "DAILY_HOMEWORK",
          title,
          assignedOn: today,
          dueOn: today,
        },
      });
    }

    const statuses = await prisma.taskStatus.findMany({
      where: { task: { classId } },
    });

    // Student 1: 2× NOT_DONE → defaulter
    // Student 2: 1× NOT_DONE → below threshold
    // Student 3: all PENDING → not listed
    await prisma.taskStatus.updateMany({
      where: {
        id: {
          in: statuses
            .filter((row) => row.studentId === studentOneId)
            .map((row) => row.id),
        },
      },
      data: { status: "NOT_DONE" },
    });

    const studentTwoFirst = statuses.find((s) => s.studentId === studentTwoId);
    if (studentTwoFirst) {
      await prisma.taskStatus.update({
        where: { id: studentTwoFirst.id },
        data: { status: "NOT_DONE" },
      });
    }

    expect(studentThreeId).toBeTruthy();
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

  it("lists students with 2+ NOT_DONE/NOT_CHECKED in the window", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/classes/${classId}/defaulters?days=7`,
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      minMisses: number;
      defaulters: Array<{
        student: { id: string; rollNumber: number };
        missCount: number;
        taskTitles: string[];
      }>;
    };
    expect(body.minMisses).toBe(2);
    expect(body.defaulters).toHaveLength(1);
    expect(body.defaulters[0]!.student.id).toBe(studentOneId);
    expect(body.defaulters[0]!.missCount).toBe(2);
    expect(body.defaulters[0]!.taskTitles.length).toBeGreaterThanOrEqual(1);
  });

  it("excludes misses outside the lookback window", async () => {
    const oldDate = kolkataCalendarDateToInstant("2020-01-01");
    await prisma.task.updateMany({
      where: { classId },
      data: { assignedOn: oldDate, dueOn: oldDate },
    });

    const res = await app.inject({
      method: "GET",
      url: `/classes/${classId}/defaulters?days=7`,
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().defaulters).toEqual([]);

    // Restore for other tests if order mattered — recreate assignedOn as today
    const today = kolkataCalendarDateToInstant(
      toKolkataCalendarDate(new Date()),
    );
    await prisma.task.updateMany({
      where: { classId },
      data: { assignedOn: today, dueOn: today },
    });
  });

  it("does not count a miss assigned exactly at the exclusive window end", async () => {
    const { toDate } = defaultersWindow(7, new Date());
    const toExclusive = kolkataCalendarDateToInstant(
      addKolkataCalendarDays(toDate, 1),
    );
    const justInside = new Date(toExclusive.getTime() - 1);
    const sample = await prisma.task.findFirstOrThrow({ where: { classId } });

    const outside = await prisma.task.create({
      data: {
        classId,
        subjectId,
        createdById: sample.createdById,
        type: "DAILY_HOMEWORK",
        title: "Boundary out",
        assignedOn: toExclusive,
        dueOn: toExclusive,
      },
    });
    const inside = await prisma.task.create({
      data: {
        classId,
        subjectId,
        createdById: sample.createdById,
        type: "DAILY_HOMEWORK",
        title: "Boundary in",
        assignedOn: justInside,
        dueOn: justInside,
      },
    });

    try {
      await prisma.taskStatus.create({
        data: {
          taskId: outside.id,
          studentId: studentTwoId,
          status: "NOT_DONE",
        },
      });

      const excluded = await app.inject({
        method: "GET",
        url: `/classes/${classId}/defaulters?days=7`,
        headers: { authorization: `Bearer ${accessToken}` },
      });
      const excludedIds = (
        excluded.json() as { defaulters: Array<{ student: { id: string } }> }
      ).defaulters.map((row) => row.student.id);
      expect(excludedIds).not.toContain(studentTwoId);

      await prisma.taskStatus.create({
        data: {
          taskId: inside.id,
          studentId: studentTwoId,
          status: "NOT_DONE",
        },
      });

      const included = await app.inject({
        method: "GET",
        url: `/classes/${classId}/defaulters?days=7`,
        headers: { authorization: `Bearer ${accessToken}` },
      });
      const row = (
        included.json() as {
          defaulters: Array<{ student: { id: string }; missCount: number }>;
        }
      ).defaulters.find((item) => item.student.id === studentTwoId);
      expect(row?.missCount).toBe(2);
    } finally {
      await prisma.task.deleteMany({
        where: { id: { in: [outside.id, inside.id] } },
      });
    }
  });

  it("forbids another teacher from viewing defaulters", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/classes/${classId}/defaulters`,
      headers: { authorization: `Bearer ${otherToken}` },
    });
    expect([403, 404]).toContain(res.statusCode);
  });

  it("rejects invalid days", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/classes/${classId}/defaulters?days=0`,
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(res.statusCode).toBe(400);
  });
});
