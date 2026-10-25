import {
  DEFAULT_DEFAULTERS_DAYS,
  DEFAULT_MIN_MISSES,
  addKolkataCalendarDays,
  defaultersWindow,
  homeResponseSchema,
  kolkataCalendarDateToInstant,
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
 * assigned tasks with pending counts, and rolling defaulter counts.
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

  const [tasks, defaulterRows] = await Promise.all([
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
  ]);

  const defaultersByClass = new Map(
    defaulterRows.map((row) => [row.classId, row.defaulterCount]),
  );
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
      };
    }),
  });
}
