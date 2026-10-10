import { describe, expect, it } from "vitest";
import {
  createTaskBodySchema,
  v1CreateTaskTypeSchema,
  validateMarksAndParts,
} from "./tasks.js";

describe("v1CreateTaskTypeSchema", () => {
  it("still names only the original V1 pair (deprecated helper)", () => {
    expect(v1CreateTaskTypeSchema.safeParse("DAILY_HOMEWORK").success).toBe(
      true,
    );
    expect(v1CreateTaskTypeSchema.safeParse("NOTEBOOK_CHECK").success).toBe(
      true,
    );
    expect(v1CreateTaskTypeSchema.safeParse("WEEKLY_TEST").success).toBe(false);
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

  it("rejects maxMarks on homework", () => {
    const result = createTaskBodySchema.safeParse({
      ...base,
      maxMarks: 20,
    });
    expect(result.success).toBe(false);
  });

  it("requires maxMarks for WEEKLY_TEST", () => {
    expect(
      createTaskBodySchema.safeParse({
        ...base,
        type: "WEEKLY_TEST",
      }).success,
    ).toBe(false);
    const ok = createTaskBodySchema.safeParse({
      ...base,
      type: "WEEKLY_TEST",
      maxMarks: 20,
    });
    expect(ok.success).toBe(true);
  });

  it("requires totalParts for HOLIDAY_HOMEWORK", () => {
    expect(
      createTaskBodySchema.safeParse({
        ...base,
        type: "HOLIDAY_HOMEWORK",
      }).success,
    ).toBe(false);
    const ok = createTaskBodySchema.safeParse({
      ...base,
      type: "HOLIDAY_HOMEWORK",
      totalParts: 5,
    });
    expect(ok.success).toBe(true);
  });

  it("rejects dueOn before assignedOn", () => {
    const result = createTaskBodySchema.safeParse({
      ...base,
      dueOn: "2026-10-01",
    });
    expect(result.success).toBe(false);
  });
});

describe("validateMarksAndParts", () => {
  it("caps marks at maxMarks for weekly tests", () => {
    expect(
      validateMarksAndParts({
        type: "WEEKLY_TEST",
        maxMarks: 20,
        totalParts: null,
        marks: 21,
      }),
    ).toMatch(/between 0 and 20/);
    expect(
      validateMarksAndParts({
        type: "WEEKLY_TEST",
        maxMarks: 20,
        totalParts: null,
        marks: 18,
      }),
    ).toBeNull();
  });

  it("caps partsDone at totalParts for holiday homework", () => {
    expect(
      validateMarksAndParts({
        type: "HOLIDAY_HOMEWORK",
        maxMarks: null,
        totalParts: 5,
        partsDone: 6,
      }),
    ).toMatch(/between 0 and 5/);
    expect(
      validateMarksAndParts({
        type: "HOLIDAY_HOMEWORK",
        maxMarks: null,
        totalParts: 5,
        partsDone: 3,
      }),
    ).toBeNull();
  });

  it("rejects marks on notebook checks", () => {
    expect(
      validateMarksAndParts({
        type: "NOTEBOOK_CHECK",
        maxMarks: null,
        totalParts: null,
        marks: 5,
      }),
    ).toMatch(/WEEKLY_TEST/);
  });
});
