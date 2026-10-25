import type { DefaultersResponse } from "./defaulters.js";
import type { StudentReport, StudentReportTask } from "./report.js";
import type { StatusValue, TaskType } from "./enums.js";

/** RFC 4180-style cell escaping. */
export function csvCell(value: string | number | null | undefined): string {
  if (value == null) return "";
  const text = String(value);
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function csvRow(cells: Array<string | number | null | undefined>): string {
  return cells.map(csvCell).join(",");
}

export function friendlyTaskType(type: TaskType): string {
  switch (type) {
    case "DAILY_HOMEWORK":
      return "Homework";
    case "NOTEBOOK_CHECK":
      return "Notebook check";
    case "WEEKLY_TEST":
      return "Weekly test";
    case "HOLIDAY_HOMEWORK":
      return "Holiday homework";
    case "ATTENDANCE":
      return "Attendance";
    default:
      return type;
  }
}

export function friendlyStatus(status: StatusValue): string {
  switch (status) {
    case "PENDING":
      return "Not marked yet";
    case "DONE":
      return "Done";
    case "NOT_DONE":
      return "Not done";
    case "INCOMPLETE":
      return "Incomplete";
    case "CHECKED":
      return "Checked";
    case "NOT_CHECKED":
      return "Not checked";
    case "ABSENT":
      return "Absent";
    default:
      return status;
  }
}

/** One clear sentence parents can read in Excel / Sheets. */
export function friendlyTaskResult(task: StudentReportTask): string {
  if (task.type === "WEEKLY_TEST") {
    if (task.marks != null && task.maxMarks != null) {
      return `Scored ${task.marks} out of ${task.maxMarks}`;
    }
    if (task.marks != null) {
      return `Scored ${task.marks}`;
    }
    return friendlyStatus(task.status);
  }

  if (task.type === "HOLIDAY_HOMEWORK") {
    if (task.partsDone != null && task.totalParts != null) {
      return `${task.partsDone} of ${task.totalParts} parts done`;
    }
    return friendlyStatus(task.status);
  }

  return friendlyStatus(task.status);
}

/**
 * Parent-friendly report CSV: plain headers and a single Result column.
 */
export function studentReportToCsv(report: StudentReport): string {
  const header = csvRow([
    "Roll no.",
    "Student name",
    "Work",
    "Type",
    "Given on",
    "Due on",
    "Result",
    "Teacher note",
  ]);

  const rows = report.tasks.map((task) =>
    csvRow([
      report.student.rollNumber,
      report.student.name,
      task.title,
      friendlyTaskType(task.type),
      task.assignedOn,
      task.dueOn,
      friendlyTaskResult(task),
      task.remark,
    ]),
  );

  return [header, ...rows].join("\n") + "\n";
}

/** One row per defaulter; missed task titles joined with "; ". */
export function defaultersToCsv(payload: DefaultersResponse): string {
  const header = csvRow([
    "Roll no.",
    "Student name",
    "Misses",
    "Missed work",
    "From",
    "To",
    "Days looked at",
  ]);

  const rows = payload.defaulters.map((row) =>
    csvRow([
      row.student.rollNumber,
      row.student.name,
      row.missCount,
      row.taskTitles.join("; "),
      payload.fromDate,
      payload.toDate,
      payload.days,
    ]),
  );

  return [header, ...rows].join("\n") + "\n";
}

export function studentReportCsvFilename(report: StudentReport): string {
  const safeName = report.student.name
    .trim()
    .replace(/[^\w\s-]+/g, "")
    .replace(/\s+/g, "-")
    .slice(0, 40);
  const label =
    safeName.length > 0 ? safeName : `roll-${report.student.rollNumber}`;
  return `${label}-report-${report.fromDate}_to_${report.toDate}.csv`;
}

export function defaultersCsvFilename(payload: DefaultersResponse): string {
  return `defaulters-${payload.fromDate}_to_${payload.toDate}.csv`;
}
