import { z } from "zod";
import { taskSchema } from "./tasks.js";

/** Fallback when the class has never had daily homework. */
export const DEFAULT_DAILY_HOMEWORK_TITLE = "Homework";

/**
 * Common titles teachers tap when creating today's homework.
 * Kept short for phone UI; not stored as a separate entity.
 */
export const DAILY_HOMEWORK_TITLE_TEMPLATES = [
  "Homework",
  "Diary writing",
  "Worksheet",
  "Revision",
] as const;

export const todayHomeworkBodySchema = z.object({
  /** Override suggested / last title. */
  title: z.string().trim().min(1).max(200).optional(),
  subjectId: z.string().min(1).optional(),
});

export const todayHomeworkResultSchema = z.object({
  task: taskSchema,
  /** False when today's daily homework already existed (idempotent). */
  created: z.boolean(),
});

export type TodayHomeworkBody = z.infer<typeof todayHomeworkBodySchema>;
export type TodayHomeworkResult = z.infer<typeof todayHomeworkResultSchema>;

type TitleSource = {
  type: string;
  title: string;
  assignedOn: string;
};

/**
 * Prefer the most recent daily homework from a prior day (repeat yesterday),
 * otherwise the default title.
 */
export function suggestDailyHomeworkTitle(
  tasks: TitleSource[],
  today: string,
  fallback: string = DEFAULT_DAILY_HOMEWORK_TITLE,
): string {
  const prior = tasks
    .filter(
      (task) =>
        task.type === "DAILY_HOMEWORK" &&
        task.assignedOn < today &&
        task.title.trim().length > 0,
    )
    .sort((a, b) => {
      const byDate = b.assignedOn.localeCompare(a.assignedOn);
      if (byDate !== 0) return byDate;
      return b.title.localeCompare(a.title);
    })[0];

  return prior?.title.trim() || fallback;
}

export function findTodaysDailyHomework<T extends TitleSource>(
  tasks: T[],
  today: string,
): T | undefined {
  return tasks.find(
    (task) => task.type === "DAILY_HOMEWORK" && task.assignedOn === today,
  );
}
