import {
  DEFAULT_DEFAULTERS_DAYS,
  DEFAULT_MIN_MISSES,
  addKolkataCalendarDays,
  defaultersWindow,
  homeResponseSchema,
  kolkataCalendarDateToInstant,
  percentOrNull,
  toKolkataCalendarDate,
  type HomeResponse,
  type Role,
  type TaskType,
} from "@classroom-tracker/shared";
import { Prisma } from "@prisma/client";
import { prisma } from "../db.js";
import { listClassesForUser } from "../classes/class.service.js";

type RawDefaulterCount = {
  classId: string;
  defaulterCount: number;
};

type RawTopDefaulter = {
  classId: string;
  studentId: string;
  name: string;
  rollNumber: number;
  missCount: number;
};

type RawWeekRates = {
  classId: string;
  attendancePresent: number;
  attendanceMarked: number;
  homeworkDone: number;
  homeworkScored: number;
};

type TaskWithCounts = {
  id: string;
  classId: string;
  title: string;
  type: TaskType;
  total: number;
  pendingCount: number;
};

/**
 * One round-trip home payload: classes the teacher can access, today's
 * assigned tasks with pending counts, week rates, and rolling defaulters.
 */
export async function getTeacherHome(
  userId: string,
  role: Role,
  now: Date = new Date(),
): Promise<HomeResponse> {
  const classes = await listClassesForUser(userId, role);
  const today = toKolkataCalendarDate(now);
  const defaultersDays = DEFAULT_DEFAULTERS_DAYS;

  if (classes.length === 0) {
    return homeResponseSchema.parse({
      today,
      defaultersDays,
      classes: [],
    });
  }

  const classIds = classes.map((c) => c.id);
  const dayStart = kolkataCalendarDateToInstant(today);
  const dayEnd = kolkataCalendarDateToInstant(addKolkataCalendarDays(today, 1));

  const { fromDate, toDate } = defaultersWindow(defaultersDays, now);
  const fromInstant = kolkataCalendarDateToInstant(fromDate);
  const toExclusive = kolkataCalendarDateToInstant(
    addKolkataCalendarDays(toDate, 1),
  );

  const [tasks, defaulterRows, topDefaulterRows, weekRateRows] =
    await Promise.all([
      prisma.$queryRaw<TaskWithCounts[]>(Prisma.sql`
      SELECT
        t.id,
        t."classId",
        t.title,
        t.type::text AS type,
        COUNT(ts.id)::int AS total,
        COUNT(*) FILTER (WHERE ts.status = 'PENDING')::int AS "pendingCount"
      FROM "Task" t
      LEFT JOIN "TaskStatus" ts ON ts."taskId" = t.id
      WHERE t."classId" IN (${Prisma.join(classIds)})
        AND t."assignedOn" >= ${dayStart}
        AND t."assignedOn" < ${dayEnd}
      GROUP BY t.id, t."classId", t.title, t.type, t."assignedOn", t."createdAt"
      ORDER BY t."assignedOn" DESC, t."createdAt" DESC
    `),
      prisma.$queryRaw<RawDefaulterCount[]>(Prisma.sql`
      SELECT
        misses."classId",
        COUNT(*)::int AS "defaulterCount"
      FROM (
        SELECT
          t."classId",
          s.id AS "studentId"
        FROM "TaskStatus" ts
        INNER JOIN "Task" t ON t.id = ts."taskId"
        INNER JOIN "Student" s ON s.id = ts."studentId"
        WHERE t."classId" IN (${Prisma.join(classIds)})
          AND ts.status IN ('NOT_DONE', 'NOT_CHECKED')
          AND t."assignedOn" >= ${fromInstant}
          AND t."assignedOn" < ${toExclusive}
        GROUP BY t."classId", s.id
        HAVING COUNT(*) >= ${DEFAULT_MIN_MISSES}
      ) AS misses
      GROUP BY misses."classId"
    `),
      prisma.$queryRaw<RawTopDefaulter[]>(Prisma.sql`
      SELECT
        ranked."classId",
        ranked."studentId",
        ranked.name,
        ranked."rollNumber",
        ranked."missCount"
      FROM (
        SELECT
          t."classId",
          s.id AS "studentId",
          s.name,
          s."rollNumber",
          COUNT(*)::int AS "missCount",
          ROW_NUMBER() OVER (
            PARTITION BY t."classId"
            ORDER BY COUNT(*) DESC, s."rollNumber" ASC
          ) AS rn
        FROM "TaskStatus" ts
        INNER JOIN "Task" t ON t.id = ts."taskId"
        INNER JOIN "Student" s ON s.id = ts."studentId"
        WHERE t."classId" IN (${Prisma.join(classIds)})
          AND ts.status IN ('NOT_DONE', 'NOT_CHECKED')
          AND t."assignedOn" >= ${fromInstant}
          AND t."assignedOn" < ${toExclusive}
        GROUP BY t."classId", s.id, s.name, s."rollNumber"
        HAVING COUNT(*) >= ${DEFAULT_MIN_MISSES}
      ) AS ranked
      WHERE ranked.rn <= 3
      ORDER BY ranked."classId", ranked.rn
    `),
      prisma.$queryRaw<RawWeekRates[]>(Prisma.sql`
      SELECT
        t."classId",
        COUNT(*) FILTER (
          WHERE t.type = 'ATTENDANCE' AND ts.status = 'DONE'
        )::int AS "attendancePresent",
        COUNT(*) FILTER (
          WHERE t.type = 'ATTENDANCE'
            AND ts.status IN ('DONE', 'ABSENT', 'INCOMPLETE')
        )::int AS "attendanceMarked",
        COUNT(*) FILTER (
          WHERE t.type = 'DAILY_HOMEWORK' AND ts.status = 'DONE'
        )::int AS "homeworkDone",
        COUNT(*) FILTER (
          WHERE t.type = 'DAILY_HOMEWORK'
            AND ts.status IN ('DONE', 'NOT_DONE', 'INCOMPLETE')
        )::int AS "homeworkScored"
      FROM "Task" t
      INNER JOIN "TaskStatus" ts ON ts."taskId" = t.id
      WHERE t."classId" IN (${Prisma.join(classIds)})
        AND t."assignedOn" >= ${fromInstant}
        AND t."assignedOn" < ${toExclusive}
      GROUP BY t."classId"
    `),
    ]);

  const defaultersByClass = new Map(
    defaulterRows.map((row) => [row.classId, row.defaulterCount]),
  );
  const weekRatesByClass = new Map(
    weekRateRows.map((row) => [row.classId, row]),
  );
  const topByClass = new Map<string, RawTopDefaulter[]>();
  for (const row of topDefaulterRows) {
    const list = topByClass.get(row.classId) ?? [];
    list.push(row);
    topByClass.set(row.classId, list);
  }
  const tasksByClass = new Map<string, TaskWithCounts[]>();
  for (const task of tasks) {
    const list = tasksByClass.get(task.classId) ?? [];
    list.push(task);
    tasksByClass.set(task.classId, list);
  }

  return homeResponseSchema.parse({
    today,
    defaultersDays,
    classes: classes.map((classroom) => {
      const todayTasks = (tasksByClass.get(classroom.id) ?? []).map((task) => ({
        id: task.id,
        title: task.title,
        type: task.type,
        total: task.total,
        pendingCount: task.pendingCount,
      }));
      const rates = weekRatesByClass.get(classroom.id);
      return {
        id: classroom.id,
        schoolId: classroom.schoolId,
        name: classroom.name,
        academicYear: classroom.academicYear,
        studentCount: classroom.studentCount ?? 0,
        todayTasks,
        pendingTodayCount: todayTasks.reduce(
          (sum, task) => sum + task.pendingCount,
          0,
        ),
        defaulterCount: defaultersByClass.get(classroom.id) ?? 0,
        attendancePresentPct: percentOrNull(
          rates?.attendancePresent ?? 0,
          rates?.attendanceMarked ?? 0,
        ),
        homeworkDonePct: percentOrNull(
          rates?.homeworkDone ?? 0,
          rates?.homeworkScored ?? 0,
        ),
        topDefaulters: (topByClass.get(classroom.id) ?? []).map((row) => ({
          studentId: row.studentId,
          name: row.name,
          rollNumber: row.rollNumber,
          missCount: row.missCount,
        })),
      };
    }),
  });
}
