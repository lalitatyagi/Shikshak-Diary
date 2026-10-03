import {
  bulkCompleteResultSchema,
  classGridSchema,
  completeStatusForType,
  isStatusAllowedForType,
  taskStatusSchema,
  toKolkataCalendarDate,
  type BulkCompleteResult,
  type ClassGridDto,
  type Role,
  type StatusValue,
  type TaskStatusDto,
  studentSchema,
} from "@classroom-tracker/shared";
import { prisma } from "../db.js";
import { HttpError } from "../errors.js";
import { assertCanAccessClass } from "../classes/class.service.js";

function toStatusDto(row: {
  id: string;
  taskId: string;
  studentId: string;
  status: TaskStatusDto["status"];
  version: number;
  marks: number | null;
  partsDone: number | null;
  remark: string | null;
}): TaskStatusDto {
  return taskStatusSchema.parse({
    id: row.id,
    taskId: row.taskId,
    studentId: row.studentId,
    status: row.status,
    version: row.version,
    marks: row.marks,
    partsDone: row.partsDone,
    remark: row.remark,
  });
}

export async function getClassGrid(
  classId: string,
  userId: string,
  role: Role,
): Promise<ClassGridDto> {
  await assertCanAccessClass(classId, userId, role);

  const classroom = await prisma.class.findUniqueOrThrow({
    where: { id: classId },
  });

  const assignment = await prisma.teacherClassSubject.findFirst({
    where: role === "ADMIN" ? { classId } : { classId, teacherId: userId },
  });
  if (!assignment) {
    throw new HttpError("No subject assignment found for this class", 403);
  }

  const [enrollments, tasks] = await Promise.all([
    prisma.enrollment.findMany({
      where: { classId },
      include: { student: true },
      orderBy: { student: { rollNumber: "asc" } },
    }),
    prisma.task.findMany({
      where: { classId },
      orderBy: [{ assignedOn: "asc" }, { createdAt: "asc" }],
    }),
  ]);

  const taskIds = tasks.map((task) => task.id);
  const statuses =
    taskIds.length === 0
      ? []
      : await prisma.taskStatus.findMany({
          where: { taskId: { in: taskIds } },
        });

  return classGridSchema.parse({
    class: {
      id: classroom.id,
      name: classroom.name,
      academicYear: classroom.academicYear,
    },
    defaultSubjectId: assignment.subjectId,
    students: enrollments.map((enrollment) =>
      studentSchema.parse(enrollment.student),
    ),
    tasks: tasks.map((task) => ({
      id: task.id,
      title: task.title,
      type: task.type,
      assignedOn: toKolkataCalendarDate(task.assignedOn),
      dueOn: toKolkataCalendarDate(task.dueOn),
    })),
    statuses: statuses.map((status) => toStatusDto(status)),
  });
}

export async function updateTaskStatus(
  statusId: string,
  userId: string,
  role: Role,
  status: StatusValue,
  expectedVersion: number,
): Promise<TaskStatusDto> {
  const existing = await prisma.taskStatus.findUnique({
    where: { id: statusId },
    include: { task: true },
  });
  if (!existing) {
    throw new HttpError("Status not found", 404);
  }

  await assertCanAccessClass(existing.task.classId, userId, role);

  if (!isStatusAllowedForType(existing.task.type, status)) {
    throw new HttpError(
      `Status ${status} is not allowed for ${existing.task.type}`,
      400,
    );
  }

  if (existing.version !== expectedVersion) {
    throw new HttpError(
      "Status was updated elsewhere — refresh and retry",
      409,
    );
  }

  const updatedCount = await prisma.taskStatus.updateMany({
    where: {
      id: statusId,
      version: expectedVersion,
    },
    data: {
      status,
      version: { increment: 1 },
      updatedById: userId,
    },
  });

  if (updatedCount.count === 0) {
    throw new HttpError(
      "Status was updated elsewhere — refresh and retry",
      409,
    );
  }

  const updated = await prisma.taskStatus.findUniqueOrThrow({
    where: { id: statusId },
  });
  return toStatusDto(updated);
}

/**
 * Mark all PENDING cells complete. Never overwrites NOT_DONE / INCOMPLETE / ABSENT / etc.
 */
export async function markAllComplete(
  taskId: string,
  userId: string,
  role: Role,
): Promise<BulkCompleteResult> {
  const task = await prisma.task.findUnique({ where: { id: taskId } });
  if (!task) {
    throw new HttpError("Task not found", 404);
  }

  await assertCanAccessClass(task.classId, userId, role);

  const target = completeStatusForType(task.type);

  const result = await prisma.taskStatus.updateMany({
    where: {
      taskId,
      status: "PENDING",
    },
    data: {
      status: target,
      version: { increment: 1 },
      updatedById: userId,
    },
  });

  return bulkCompleteResultSchema.parse({
    taskId,
    status: target,
    updated: result.count,
  });
}
