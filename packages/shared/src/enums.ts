import { z } from "zod";

export const roleSchema = z.enum([
  "TEACHER",
  "CLASS_TEACHER",
  "ADMIN",
  "PARENT",
]);

export const taskTypeSchema = z.enum([
  "DAILY_HOMEWORK",
  "HOLIDAY_HOMEWORK",
  "WEEKLY_TEST",
  "NOTEBOOK_CHECK",
]);

export const statusValueSchema = z.enum([
  "PENDING",
  "DONE",
  "NOT_DONE",
  "INCOMPLETE",
  "CHECKED",
  "NOT_CHECKED",
  "ABSENT",
]);

export type Role = z.infer<typeof roleSchema>;
export type TaskType = z.infer<typeof taskTypeSchema>;
export type StatusValue = z.infer<typeof statusValueSchema>;
