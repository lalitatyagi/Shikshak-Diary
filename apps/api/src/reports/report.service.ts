import {
  addKolkataCalendarDays,
  defaultersWindow,
  kolkataCalendarDateToInstant,
  studentReportSchema,
  studentSchema,
  toKolkataCalendarDate,
  type Role,
  type StudentReport,
  type StatusValue,
} from "@classroom-tracker/shared";
import { prisma } from "../db.js";
import { HttpError } from "../errors.js";
import { assertCanAccessClass } from "../classes/class.service.js";

function isDone(status: StatusValue): boolean {
  return status === "DONE" || status === "CHECKED";
}

function isNotDone(status: StatusValue): boolean {
  return status === "NOT_DONE" || status === "NOT_CHECKED";
}

/**
 * Build a student report without auth. Caller must already authorize access.
 */
export async function buildStudentReport(
  classId: string,
  studentId: string,
  days: number,
  now: Date = new Date(),
): Promise<StudentReport> {
  const enrollment = await prisma.enrollment.findUnique({
    where: { studentId_classId: { studentId, classId } },
    include: { student: true },
  });
  if (!enrollment) {
    throw new HttpError("Student is not enrolled in this class", 404);
  }

  const { fromDate, toDate } = defaultersWindow(days, now);
  const fromInstant = kolkataCalendarDateToInstant(fromDate);
  const toExclusive = kolkataCalendarDateToInstant(
    addKolkataCalendarDays(toDate, 1),
  );

  const rows = await prisma.taskStatus.findMany({
    where: {
      studentId,
      task: {
        classId,
        assignedOn: { gte: fromInstant, lt: toExclusive },
      },
    },
    include: { task: true },
    orderBy: [
      { task: { assignedOn: "desc" } },
      { task: { createdAt: "desc" } },
    ],
  });

  let doneCount = 0;
  let notDoneCount = 0;
  let incompleteCount = 0;
  let absentCount = 0;
  let pendingCount = 0;
  let weeklyTestCount = 0;
  let marksSum = 0;
  let marksCount = 0;

  for (const row of rows) {
    if (isDone(row.status)) doneCount += 1;
    else if (isNotDone(row.status)) notDoneCount += 1;
    else if (row.status === "INCOMPLETE") incompleteCount += 1;
    else if (row.status === "ABSENT") absentCount += 1;
    else pendingCount += 1;

    if (row.task.type === "WEEKLY_TEST") {
      weeklyTestCount += 1;
      if (row.marks != null) {
        marksSum += row.marks;
        marksCount += 1;
      }
    }
  }

  return studentReportSchema.parse({
    classId,
    days,
    fromDate,
    toDate,
    student: studentSchema.parse(enrollment.student),
    summary: {
      totalTasks: rows.length,
      doneCount,
      notDoneCount,
      incompleteCount,
      absentCount,
      pendingCount,
      weeklyTestCount,
      weeklyTestAvgMarks:
        marksCount > 0 ? Math.round((marksSum / marksCount) * 10) / 10 : null,
    },
    tasks: rows.map((row) => ({
      taskId: row.task.id,
      title: row.task.title,
      type: row.task.type,
      assignedOn: toKolkataCalendarDate(row.task.assignedOn),
      dueOn: toKolkataCalendarDate(row.task.dueOn),
      maxMarks: row.task.maxMarks,
      totalParts: row.task.totalParts,
      status: row.status,
      marks: row.marks,
      partsDone: row.partsDone,
      remark: row.remark,
    })),
  });
}

/**
 * Per-student activity report for one class over the last N Kolkata days.
 */
export async function getStudentReport(
  classId: string,
  studentId: string,
  userId: string,
  role: Role,
  days: number,
  now: Date = new Date(),
): Promise<StudentReport> {
  await assertCanAccessClass(classId, userId, role);
  return buildStudentReport(classId, studentId, days, now);
}
