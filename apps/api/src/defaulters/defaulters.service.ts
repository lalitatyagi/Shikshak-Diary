import {
  DEFAULT_MIN_MISSES,
  addKolkataCalendarDays,
  defaultersResponseSchema,
  defaultersWindow,
  kolkataCalendarDateToInstant,
  type DefaultersResponse,
  type Role,
} from "@classroom-tracker/shared";
import { Prisma } from "@prisma/client";
import { prisma } from "../db.js";
import { assertCanAccessClass } from "../classes/class.service.js";

type RawDefaulterRow = {
  id: string;
  schoolId: string;
  name: string;
  rollNumber: number;
  parentContact: string | null;
  missCount: number;
  taskTitles: string[];
};

/**
 * Students with 2+ NOT_DONE / NOT_CHECKED statuses on tasks assigned in the
 * last `days` Kolkata calendar days (inclusive). Uses SQL aggregation so the
 * list stays cheap for a full class.
 */
export async function listDefaulters(
  classId: string,
  userId: string,
  role: Role,
  days: number,
  now: Date = new Date(),
): Promise<DefaultersResponse> {
  await assertCanAccessClass(classId, userId, role);

  const { fromDate, toDate } = defaultersWindow(days, now);
  const fromInstant = kolkataCalendarDateToInstant(fromDate);
  // Exclusive upper bound: first instant of the day after toDate.
  const toExclusive = kolkataCalendarDateToInstant(
    addKolkataCalendarDays(toDate, 1),
  );

  const rows = await prisma.$queryRaw<RawDefaulterRow[]>(Prisma.sql`
    SELECT
      s.id,
      s."schoolId",
      s.name,
      s."rollNumber",
      s."parentContact",
      COUNT(*)::int AS "missCount",
      array_agg(t.title ORDER BY t."assignedOn" DESC, t."createdAt" DESC)
        AS "taskTitles"
    FROM "TaskStatus" ts
    INNER JOIN "Task" t ON t.id = ts."taskId"
    INNER JOIN "Student" s ON s.id = ts."studentId"
    WHERE t."classId" = ${classId}
      AND ts.status IN ('NOT_DONE', 'NOT_CHECKED')
      AND t."assignedOn" >= ${fromInstant}
      AND t."assignedOn" < ${toExclusive}
    GROUP BY s.id, s."schoolId", s.name, s."rollNumber", s."parentContact"
    HAVING COUNT(*) >= ${DEFAULT_MIN_MISSES}
    ORDER BY COUNT(*) DESC, s."rollNumber" ASC
  `);

  return defaultersResponseSchema.parse({
    classId,
    days,
    fromDate,
    toDate,
    minMisses: DEFAULT_MIN_MISSES,
    defaulters: rows.map((row) => ({
      student: {
        id: row.id,
        schoolId: row.schoolId,
        name: row.name,
        rollNumber: row.rollNumber,
        parentContact: row.parentContact,
      },
      missCount: row.missCount,
      taskTitles: (row.taskTitles ?? []).slice(0, 5),
    })),
  });
}
