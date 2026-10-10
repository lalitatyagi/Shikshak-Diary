import {
  bulkCompleteResultSchema,
  classGridSchema,
  completeStatusForType,
  isStatusAllowedForType,
  taskStatusSchema,
  toKolkataCalendarDate,
  validateMarksAndParts,
  type BulkCompleteResult,
  type ClassGridDto,
  type Role,
  type StatusValue,
  type TaskStatusDto,
  studentSchema,
} from "@classroom-tracker/shared";
import { prisma } from "../db.js";
import { HttpError } from "../errors.js";
import { writeAudit } from "../audit.js";
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
    orderBy: { subjectId: "asc" },
  });
  let defaultSubjectId = assignment?.subjectId;
  if (!defaultSubjectId && role === "ADMIN") {
    const subject = await prisma.subject.findFirst({
      where: { schoolId: classroom.schoolId },
      orderBy: [{ name: "asc" }, { id: "asc" }],
    });
    defaultSubjectId = subject?.id;
  }
  if (!defaultSubjectId) {
    throw new HttpError("No subject found for this class", 404);
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
    defaultSubjectId,
    students: enrollments.map((enrollment) =>
      studentSchema.parse(enrollment.student),
    ),
    tasks: tasks.map((task) => ({
      id: task.id,
      title: task.title,
      type: task.type,
      assignedOn: toKolkataCalendarDate(task.assignedOn),
      dueOn: toKolkataCalendarDate(task.dueOn),
      maxMarks: task.maxMarks,
      totalParts: task.totalParts,
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
  marks?: number | null,
  partsDone?: number | null,
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

  const nextMarks = marks !== undefined ? marks : existing.marks;
  const nextPartsDone =
    partsDone !== undefined ? partsDone : existing.partsDone;
  const fieldError = validateMarksAndParts({
    type: existing.task.type,
    maxMarks: existing.task.maxMarks,
    totalParts: existing.task.totalParts,
    marks: nextMarks,
    partsDone: nextPartsDone,
  });
  if (fieldError) {
    throw new HttpError(fieldError, 400);
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
      marks: nextMarks,
      partsDone: nextPartsDone,
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
  await writeAudit(prisma, {
    userId,
    entity: "TaskStatus",
    entityId: updated.id,
    action: "update",
    before: {
      status: existing.status,
      version: existing.version,
      marks: existing.marks,
      partsDone: existing.partsDone,
    },
    after: {
      status: updated.status,
      version: updated.version,
      marks: updated.marks,
      partsDone: updated.partsDone,
    },
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

  if (result.count > 0) {
    await writeAudit(prisma, {
      userId,
      entity: "Task",
      entityId: taskId,
      action: "mark-all-complete",
      after: { status: target, updated: result.count },
    });
  }

  return bulkCompleteResultSchema.parse({
    taskId,
    status: target,
    updated: result.count,
  });
}
