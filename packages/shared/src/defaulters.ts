import { z } from "zod";
import { studentSchema } from "./classes.js";

/** Default lookback for “who has fallen behind”. */
export const DEFAULT_DEFAULTERS_DAYS = 7;

/** Students with this many (or more) misses appear on the list. */
export const DEFAULT_MIN_MISSES = 2;

export const defaultersQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(90).default(DEFAULT_DEFAULTERS_DAYS),
});

export const defaulterRowSchema = z.object({
  student: studentSchema,
  missCount: z.number().int().positive(),
  /** Recent missed task titles (newest first), capped by the API. */
  taskTitles: z.array(z.string().min(1)),
});

export const defaultersResponseSchema = z.object({
  classId: z.string().min(1),
  days: z.number().int().positive(),
  fromDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  toDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  minMisses: z.number().int().positive(),
  defaulters: z.array(defaulterRowSchema),
});

export type DefaultersQuery = z.infer<typeof defaultersQuerySchema>;
export type DefaulterRow = z.infer<typeof defaulterRowSchema>;
export type DefaultersResponse = z.infer<typeof defaultersResponseSchema>;
