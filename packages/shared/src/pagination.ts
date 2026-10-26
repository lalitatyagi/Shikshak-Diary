import { z } from "zod";
import { taskTypeSchema } from "./enums.js";

export const DEFAULT_PAGE = 1;
export const DEFAULT_PAGE_SIZE = 40;
export const MAX_PAGE_SIZE = 100;

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(DEFAULT_PAGE),
  pageSize: z.coerce
    .number()
    .int()
    .min(1)
    .max(MAX_PAGE_SIZE)
    .default(DEFAULT_PAGE_SIZE),
});

/** Shared search string (name or roll). Empty string → undefined. */
export const searchQuerySchema = z
  .string()
  .trim()
  .max(80)
  .optional()
  .transform((value) => (value && value.length > 0 ? value : undefined));

export const studentsListQuerySchema = paginationQuerySchema.extend({
  q: searchQuerySchema,
  /** When true, only students with no usable parent phone. */
  missingContact: z
    .union([
      z.literal("1"),
      z.literal("true"),
      z.literal("0"),
      z.literal("false"),
    ])
    .optional()
    .transform((value) =>
      value === undefined ? undefined : value === "1" || value === "true",
    ),
});

export const tasksListQuerySchema = paginationQuerySchema.extend({
  type: taskTypeSchema.optional(),
});

/** Tick-grid filters: narrow columns (tasks) and rows (students). */
export const gridQuerySchema = z.object({
  type: taskTypeSchema.optional(),
  /** Lookback on task assignedOn (Kolkata days). Omit = all tasks. */
  days: z.coerce.number().int().min(1).max(365).optional(),
  q: searchQuerySchema,
});

export function paginatedResponseSchema<T extends z.ZodTypeAny>(itemSchema: T) {
  return z.object({
    items: z.array(itemSchema),
    page: z.number().int().positive(),
    pageSize: z.number().int().positive(),
    total: z.number().int().nonnegative(),
    totalPages: z.number().int().nonnegative(),
  });
}

export function toPaginated<T>(
  items: T[],
  total: number,
  page: number,
  pageSize: number,
): {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
} {
  return {
    items,
    page,
    pageSize,
    total,
    totalPages: total === 0 ? 0 : Math.ceil(total / pageSize),
  };
}

export type PaginationQuery = z.infer<typeof paginationQuerySchema>;
export type StudentsListQuery = z.infer<typeof studentsListQuerySchema>;
export type TasksListQuery = z.infer<typeof tasksListQuerySchema>;
export type GridQuery = z.infer<typeof gridQuerySchema>;
