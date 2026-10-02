import { describe, expect, it } from "vitest";
import { roleSchema, statusValueSchema, taskTypeSchema } from "./enums.js";

describe("shared enums", () => {
  it("matches the Prisma Role enum", () => {
    expect(roleSchema.options).toEqual([
      "TEACHER",
      "CLASS_TEACHER",
      "ADMIN",
      "PARENT",
    ]);
  });

  it("matches the Prisma TaskType enum", () => {
    expect(taskTypeSchema.options).toEqual([
      "DAILY_HOMEWORK",
      "HOLIDAY_HOMEWORK",
      "WEEKLY_TEST",
      "NOTEBOOK_CHECK",
    ]);
  });

  it("matches the Prisma StatusValue enum", () => {
    expect(statusValueSchema.options).toEqual([
      "PENDING",
      "DONE",
      "NOT_DONE",
      "INCOMPLETE",
      "CHECKED",
      "NOT_CHECKED",
      "ABSENT",
    ]);
  });
});
