import { z } from "zod";
import { statusValueSchema, taskTypeSchema } from "./enums.js";
import { studentSchema } from "./classes.js";

export const taskStatusSchema = z.object({
  id: z.string().min(1),
  taskId: z.string().min(1),
  studentId: z.string().min(1),
  status: statusValueSchema,
  version: z.number().int().positive(),
  marks: z.number().int().nullable().optional(),
  partsDone: z.number().int().nullable().optional(),
  remark: z.string().nullable().optional(),
});

export const cycleStatusBodySchema = z.object({
  version: z.number().int().positive(),
});

export const updateStatusBodySchema = z.object({
  status: statusValueSchema,
  version: z.number().int().positive(),
});

export const gridTaskSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  type: taskTypeSchema,
  assignedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  dueOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export const classGridSchema = z.object({
  class: z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    academicYear: z.string().min(1),
  }),
  /** Subject used when creating tasks from the grid UI. */
  defaultSubjectId: z.string().min(1),
  students: z.array(studentSchema),
  tasks: z.array(gridTaskSchema),
  statuses: z.array(taskStatusSchema),
});

export const bulkCompleteResultSchema = z.object({
  taskId: z.string().min(1),
  status: statusValueSchema,
  updated: z.number().int().nonnegative(),
});

export type TaskStatusDto = z.infer<typeof taskStatusSchema>;
export type ClassGridDto = z.infer<typeof classGridSchema>;
export type CycleStatusBody = z.infer<typeof cycleStatusBodySchema>;
export type UpdateStatusBody = z.infer<typeof updateStatusBodySchema>;
export type BulkCompleteResult = z.infer<typeof bulkCompleteResultSchema>;
