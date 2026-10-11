import type { DefaultersResponse } from "./defaulters.js";
import type { StudentReport } from "./report.js";

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

/**
 * One row per task status in the student report (includes student identity columns).
 */
export function studentReportToCsv(report: StudentReport): string {
  const header = csvRow([
    "rollNumber",
    "name",
    "assignedOn",
    "dueOn",
    "type",
    "title",
    "status",
    "marks",
    "maxMarks",
    "partsDone",
    "totalParts",
    "remark",
  ]);

  const rows = report.tasks.map((task) =>
    csvRow([
      report.student.rollNumber,
      report.student.name,
      task.assignedOn,
      task.dueOn,
      task.type,
      task.title,
      task.status,
      task.marks,
      task.maxMarks,
      task.partsDone,
      task.totalParts,
      task.remark,
    ]),
  );

  return [header, ...rows].join("\n") + "\n";
}

/** One row per defaulter; missed task titles joined with "; ". */
export function defaultersToCsv(payload: DefaultersResponse): string {
  const header = csvRow([
    "rollNumber",
    "name",
    "missCount",
    "taskTitles",
    "fromDate",
    "toDate",
    "days",
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
  const roll = report.student.rollNumber;
  return `student-report-roll-${roll}-${report.fromDate}_to_${report.toDate}.csv`;
}

export function defaultersCsvFilename(payload: DefaultersResponse): string {
  return `defaulters-${payload.fromDate}_to_${payload.toDate}.csv`;
}
