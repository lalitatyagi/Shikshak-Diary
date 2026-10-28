import {
  DEFAULT_DAILY_HOMEWORK_TITLE,
  expandRecurringDates,
  kolkataCalendarDateToInstant,
  suggestDailyHomeworkTitle,
  taskSchema,
  toKolkataCalendarDate,
  toPaginated,
  type CreateRecurringTasksBody,
  type CreateRecurringTasksResult,
  type CreateTaskBody,
  type Role,
  type TaskDto,
  type TaskType,
  type TodayHomeworkBody,
  type TodayHomeworkResult,
} from "@classroom-tracker/shared";
import { Prisma } from "@prisma/client";
import { prisma } from "../db.js";
import { HttpError } from "../errors.js";
import { assertCanAccessClass } from "../classes/class.service.js";

function toTaskDto(
  task: {
    id: string;
    classId: string;
    subjectId: string;
    createdById: string;
    type: TaskDto["type"];
    title: string;
    description: string;
    assignedOn: Date;
    dueOn: Date;
    maxMarks: number | null;
    totalParts: number | null;
    createdAt: Date;
  },
  statusCount: number,
): TaskDto {
  return taskSchema.parse({
    id: task.id,
    classId: task.classId,
    subjectId: task.subjectId,
    createdById: task.createdById,
    type: task.type,
    title: task.title,
    description: task.description,
    assignedOn: toKolkataCalendarDate(task.assignedOn),
    dueOn: toKolkataCalendarDate(task.dueOn),
    maxMarks: task.maxMarks,
    totalParts: task.totalParts,
    createdAt: task.createdAt.toISOString(),
    statusCount,
  });
}

async function assertCanTeachSubject(
  teacherId: string,
  role: Role,
  classId: string,
  subjectId: string,
): Promise<void> {
  const subject = await prisma.subject.findUnique({ where: { id: subjectId } });
  if (!subject) {
    throw new HttpError("Subject not found", 404);
  }

  if (role === "ADMIN") {
    return;
  }

  const assignment = await prisma.teacherClassSubject.findUnique({
    where: {
      teacherId_classId_subjectId: {
        teacherId,
        classId,
        subjectId,
      },
    },
  });

  if (!assignment) {
    throw new HttpError(
      "You are not assigned to this subject for the class",
      403,
    );
  }
}

/**
 * Creates a task and one PENDING TaskStatus per enrolled student
 * in a single transaction.
 */
export async function createTaskForClass(
  classId: string,
  teacherId: string,
  role: Role,
  input: CreateTaskBody,
): Promise<TaskDto> {
  await assertCanAccessClass(classId, teacherId, role);
  await assertCanTeachSubject(teacherId, role, classId, input.subjectId);

  const assignedOn = kolkataCalendarDateToInstant(input.assignedOn);
  const dueOn = kolkataCalendarDateToInstant(input.dueOn);

  const created = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw(
      Prisma.sql`SELECT id FROM "Class" WHERE id = ${classId} FOR UPDATE`,
    );
    const enrollments = await tx.enrollment.findMany({
      where: { classId },
      select: { studentId: true },
    });

    if (input.type === "ATTENDANCE") {
      const dayEnd = new Date(assignedOn.getTime() + 24 * 60 * 60 * 1000);
      const existing = await tx.task.findFirst({
        where: {
          classId,
          subjectId: input.subjectId,
          type: "ATTENDANCE",
          assignedOn: { gte: assignedOn, lt: dayEnd },
        },
        select: { id: true },
      });
      if (existing) {
        throw new HttpError(
          `Attendance for ${input.assignedOn} already exists`,
          409,
        );
      }
    }

    const task = await tx.task.create({
      data: {
        classId,
        subjectId: input.subjectId,
        createdById: teacherId,
        type: input.type,
        title: input.title,
        description: input.description,
        assignedOn,
        dueOn,
        maxMarks:
          input.type === "WEEKLY_TEST" ? (input.maxMarks ?? null) : null,
        totalParts:
          input.type === "HOLIDAY_HOMEWORK" ? (input.totalParts ?? null) : null,
      },
    });

    if (enrollments.length > 0) {
      await tx.taskStatus.createMany({
        data: enrollments.map((enrollment) => ({
          taskId: task.id,
          studentId: enrollment.studentId,
          status: "PENDING",
        })),
      });
    }

    return { task, statusCount: enrollments.length };
  });

  return toTaskDto(created.task, created.statusCount);
}

/**
 * Creates one Task (+ PENDING statuses) per matching day in the range.
 * Skips a day when the same subject/type/title already exists that day.
 */
export async function createRecurringTasksForClass(
  classId: string,
  teacherId: string,
  role: Role,
  input: CreateRecurringTasksBody,
): Promise<CreateRecurringTasksResult> {
  await assertCanAccessClass(classId, teacherId, role);
  await assertCanTeachSubject(teacherId, role, classId, input.subjectId);

  let dates: string[];
  try {
    dates = expandRecurringDates(input.fromDate, input.toDate, input.weekdays);
  } catch (error) {
    throw new HttpError(
      error instanceof Error ? error.message : "Invalid recurring date range",
      400,
    );
  }
  if (dates.length === 0) {
    throw new HttpError("No matching days in this date range", 400);
  }

  const created = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw(
      Prisma.sql`SELECT id FROM "Class" WHERE id = ${classId} FOR UPDATE`,
    );
    const enrollments = await tx.enrollment.findMany({
      where: { classId },
      select: { studentId: true },
    });

    const tasks: TaskDto[] = [];
    const skippedDates: string[] = [];

    for (const date of dates) {
      const dayStart = kolkataCalendarDateToInstant(date);
      const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
      const existing = await tx.task.findFirst({
        where: {
          classId,
          subjectId: input.subjectId,
          type: input.type,
          // One attendance sheet per subject per day, even if the title differs.
          ...(input.type === "ATTENDANCE" ? {} : { title: input.title }),
          assignedOn: { gte: dayStart, lt: dayEnd },
        },
        select: { id: true },
      });
      if (existing) {
        skippedDates.push(date);
        continue;
      }

      const task = await tx.task.create({
        data: {
          classId,
          subjectId: input.subjectId,
          createdById: teacherId,
          type: input.type,
          title: input.title,
          description: input.description,
          assignedOn: dayStart,
          dueOn: dayStart,
          maxMarks:
            input.type === "WEEKLY_TEST" ? (input.maxMarks ?? null) : null,
          totalParts:
            input.type === "HOLIDAY_HOMEWORK"
              ? (input.totalParts ?? null)
              : null,
        },
      });

      if (enrollments.length > 0) {
        await tx.taskStatus.createMany({
          data: enrollments.map((enrollment) => ({
            taskId: task.id,
            studentId: enrollment.studentId,
            status: "PENDING",
          })),
        });
      }

      tasks.push(toTaskDto(task, enrollments.length));
    }

    return { created: tasks, skippedDates };
  });

  return created;
}

export async function listTasksForClass(
  classId: string,
  userId: string,
  role: Role,
  options: { page: number; pageSize: number; type?: TaskType } = {
    page: 1,
    pageSize: 40,
  },
): Promise<{
  items: TaskDto[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}> {
  await assertCanAccessClass(classId, userId, role);

  const where = {
    classId,
    ...(options.type ? { type: options.type } : {}),
  };

  const [total, tasks] = await Promise.all([
    prisma.task.count({ where }),
    prisma.task.findMany({
      where,
      orderBy: [{ assignedOn: "desc" }, { createdAt: "desc" }],
      include: { _count: { select: { statuses: true } } },
      skip: (options.page - 1) * options.pageSize,
      take: options.pageSize,
    }),
  ]);

  return toPaginated(
    tasks.map((task) => toTaskDto(task, task._count.statuses)),
    total,
    options.page,
    options.pageSize,
  );
}

export async function getTaskById(
  taskId: string,
  userId: string,
  role: Role,
): Promise<TaskDto> {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: { _count: { select: { statuses: true } } },
  });
  if (!task) {
    throw new HttpError("Task not found", 404);
  }

  await assertCanAccessClass(task.classId, userId, role);
  return toTaskDto(task, task._count.statuses);
}

async function resolveDefaultSubjectId(
  classId: string,
  teacherId: string,
  role: Role,
  preferredSubjectId?: string,
): Promise<string> {
  if (preferredSubjectId) {
    await assertCanTeachSubject(teacherId, role, classId, preferredSubjectId);
    return preferredSubjectId;
  }

  const classroom = await prisma.class.findUniqueOrThrow({
    where: { id: classId },
  });
  const assignment = await prisma.teacherClassSubject.findFirst({
    where: role === "ADMIN" ? { classId } : { classId, teacherId },
    orderBy: { subjectId: "asc" },
  });
  let subjectId = assignment?.subjectId;
  if (!subjectId && role === "ADMIN") {
    const subject = await prisma.subject.findFirst({
      where: { schoolId: classroom.schoolId },
      orderBy: [{ name: "asc" }, { id: "asc" }],
    });
    subjectId = subject?.id;
  }
  if (!subjectId) {
    throw new HttpError("No subject found for this class", 404);
  }
  return subjectId;
}

/**
 * One-tap daily homework for today: reuses yesterday's title when possible,
 * and is idempotent if today's homework already exists for the subject.
 */
export async function createTodaysDailyHomework(
  classId: string,
  teacherId: string,
  role: Role,
  input: TodayHomeworkBody = {},
  now: Date = new Date(),
): Promise<TodayHomeworkResult> {
  await assertCanAccessClass(classId, teacherId, role);
  const subjectId = await resolveDefaultSubjectId(
    classId,
    teacherId,
    role,
    input.subjectId,
  );
  const today = toKolkataCalendarDate(now);
  const todayStart = kolkataCalendarDateToInstant(today);
  const tomorrowStart = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);

  const existing = await prisma.task.findFirst({
    where: {
      classId,
      subjectId,
      type: "DAILY_HOMEWORK",
      assignedOn: { gte: todayStart, lt: tomorrowStart },
    },
    include: { _count: { select: { statuses: true } } },
    orderBy: { createdAt: "asc" },
  });
  if (existing) {
    return {
      task: toTaskDto(existing, existing._count.statuses),
      created: false,
    };
  }

  let title = input.title?.trim();
  if (!title) {
    const prior = await prisma.task.findMany({
      where: {
        classId,
        type: "DAILY_HOMEWORK",
        assignedOn: { lt: todayStart },
      },
      orderBy: [{ assignedOn: "desc" }, { createdAt: "desc" }],
      take: 20,
      select: { type: true, title: true, assignedOn: true },
    });
    title = suggestDailyHomeworkTitle(
      prior.map((row) => ({
        type: row.type,
        title: row.title,
        assignedOn: toKolkataCalendarDate(row.assignedOn),
      })),
      today,
      DEFAULT_DAILY_HOMEWORK_TITLE,
    );
  }

  const task = await createTaskForClass(classId, teacherId, role, {
    subjectId,
    type: "DAILY_HOMEWORK",
    title,
    description: "",
    assignedOn: today,
    dueOn: today,
  });

  return { task, created: true };
}
