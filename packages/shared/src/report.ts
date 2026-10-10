import { z } from "zod";
import { studentSchema } from "./classes.js";
import { statusValueSchema, taskTypeSchema } from "./enums.js";

/** Lookback for the student report (Kolkata calendar days). */
export const DEFAULT_REPORT_DAYS = 30;

export const studentReportQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(365).default(DEFAULT_REPORT_DAYS),
});

export const studentReportTaskSchema = z.object({
  taskId: z.string().min(1),
  title: z.string().min(1),
  type: taskTypeSchema,
  assignedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  dueOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  maxMarks: z.number().int().nullable(),
  totalParts: z.number().int().nullable(),
  status: statusValueSchema,
  marks: z.number().int().nullable(),
  partsDone: z.number().int().nullable(),
  remark: z.string().nullable(),
});

export const studentReportSummarySchema = z.object({
  totalTasks: z.number().int().nonnegative(),
  doneCount: z.number().int().nonnegative(),
  notDoneCount: z.number().int().nonnegative(),
  incompleteCount: z.number().int().nonnegative(),
  absentCount: z.number().int().nonnegative(),
  pendingCount: z.number().int().nonnegative(),
  weeklyTestCount: z.number().int().nonnegative(),
  /** Average of recorded marks on WEEKLY_TEST rows; null if none scored. */
  weeklyTestAvgMarks: z.number().nullable(),
});

export const studentReportSchema = z.object({
  classId: z.string().min(1),
  days: z.number().int().positive(),
  fromDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  toDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  student: studentSchema,
  summary: studentReportSummarySchema,
  tasks: z.array(studentReportTaskSchema),
});

export type StudentReportQuery = z.infer<typeof studentReportQuerySchema>;
export type StudentReportTask = z.infer<typeof studentReportTaskSchema>;
export type StudentReportSummary = z.infer<typeof studentReportSummarySchema>;
export type StudentReport = z.infer<typeof studentReportSchema>;
