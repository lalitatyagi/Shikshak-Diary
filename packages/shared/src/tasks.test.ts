import { describe, expect, it } from "vitest";
import { createTaskBodySchema, v1CreateTaskTypeSchema } from "./tasks.js";

describe("v1CreateTaskTypeSchema", () => {
  it("allows DAILY_HOMEWORK and NOTEBOOK_CHECK only", () => {
    expect(v1CreateTaskTypeSchema.safeParse("DAILY_HOMEWORK").success).toBe(
      true,
    );
    expect(v1CreateTaskTypeSchema.safeParse("NOTEBOOK_CHECK").success).toBe(
      true,
    );
    expect(v1CreateTaskTypeSchema.safeParse("WEEKLY_TEST").success).toBe(false);
    expect(v1CreateTaskTypeSchema.safeParse("HOLIDAY_HOMEWORK").success).toBe(
      false,
    );
  });
});

describe("createTaskBodySchema", () => {
  const base = {
    subjectId: "sub_1",
    type: "DAILY_HOMEWORK" as const,
    title: "Ex 1.2",
    assignedOn: "2026-10-03",
    dueOn: "2026-10-04",
  };

  it("accepts YYYY-MM-DD calendar dates", () => {
    const result = createTaskBodySchema.safeParse(base);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.assignedOn).toBe("2026-10-03");
      expect(result.data.dueOn).toBe("2026-10-04");
    }
  });

  it("normalizes ISO datetimes to Kolkata calendar dates", () => {
    const result = createTaskBodySchema.safeParse({
      ...base,
      assignedOn: "2026-10-03T00:00:00.000Z",
      dueOn: "2026-10-04T00:00:00.000Z",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.assignedOn).toBe("2026-10-03");
      expect(result.data.dueOn).toBe("2026-10-04");
    }
  });

  it("rejects maxMarks on V1 task types", () => {
    const result = createTaskBodySchema.safeParse({
      ...base,
      maxMarks: 20,
    });
    expect(result.success).toBe(false);
  });

  it("rejects dueOn before assignedOn", () => {
    const result = createTaskBodySchema.safeParse({
      ...base,
      dueOn: "2026-10-01",
    });
    expect(result.success).toBe(false);
  });
});
