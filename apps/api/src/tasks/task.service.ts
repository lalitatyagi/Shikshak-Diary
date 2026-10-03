import {
  kolkataCalendarDateToInstant,
  taskSchema,
  toKolkataCalendarDate,
  type CreateTaskBody,
  type Role,
  type TaskDto,
} from "@classroom-tracker/shared";
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

  const enrollments = await prisma.enrollment.findMany({
    where: { classId },
    select: { studentId: true },
  });

  const assignedOn = kolkataCalendarDateToInstant(input.assignedOn);
  const dueOn = kolkataCalendarDateToInstant(input.dueOn);

  const created = await prisma.$transaction(async (tx) => {
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
        maxMarks: null,
        totalParts: null,
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

    return task;
  });

  return toTaskDto(created, enrollments.length);
}

export async function listTasksForClass(
  classId: string,
  userId: string,
  role: Role,
): Promise<TaskDto[]> {
  await assertCanAccessClass(classId, userId, role);

  const tasks = await prisma.task.findMany({
    where: { classId },
    orderBy: [{ assignedOn: "desc" }, { createdAt: "desc" }],
    include: { _count: { select: { statuses: true } } },
  });

  return tasks.map((task) => toTaskDto(task, task._count.statuses));
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
