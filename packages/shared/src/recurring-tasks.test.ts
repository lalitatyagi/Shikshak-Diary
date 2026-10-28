import { describe, expect, it } from "vitest";
import { kolkataIsoWeekday } from "./dates.js";
import {
  ALL_WEEK_DAYS,
  WEEKDAY_SCHOOL_DAYS,
  createRecurringTasksBodySchema,
  expandRecurringDates,
  plannedRepeatDates,
  repeatWindowDates,
} from "./recurring-tasks.js";

describe("kolkataIsoWeekday", () => {
  it("maps known Kolkata calendar dates", () => {
    // 2026-10-26 is a Monday in Asia/Kolkata
    expect(kolkataIsoWeekday("2026-10-26")).toBe(1);
    expect(kolkataIsoWeekday("2026-10-31")).toBe(6);
    expect(kolkataIsoWeekday("2026-11-01")).toBe(7);
  });
});

describe("expandRecurringDates", () => {
  it("returns Mon–Fri only inside a week", () => {
    expect(
      expandRecurringDates("2026-10-26", "2026-11-01", [
        ...WEEKDAY_SCHOOL_DAYS,
      ]),
    ).toEqual([
      "2026-10-26",
      "2026-10-27",
      "2026-10-28",
      "2026-10-29",
      "2026-10-30",
    ]);
  });

  it("plans the same 7-day window the grid form shows", () => {
    expect(repeatWindowDates("2026-10-28")).toEqual([
      "2026-10-28",
      "2026-10-29",
      "2026-10-30",
      "2026-10-31",
      "2026-11-01",
      "2026-11-02",
      "2026-11-03",
    ]);
    expect(plannedRepeatDates("2026-10-28", "weekdays")).toEqual([
      "2026-10-28",
      "2026-10-29",
      "2026-10-30",
      "2026-11-02",
      "2026-11-03",
    ]);
    expect(plannedRepeatDates("2026-10-28", "daily")).toHaveLength(7);
  });

  it("can include weekends", () => {
    expect(
      expandRecurringDates("2026-10-30", "2026-11-01", [...ALL_WEEK_DAYS]),
    ).toEqual(["2026-10-30", "2026-10-31", "2026-11-01"]);
  });
});

describe("createRecurringTasksBodySchema", () => {
  it("accepts a weekday notebook-check pattern", () => {
    const parsed = createRecurringTasksBodySchema.parse({
      subjectId: "sub1",
      type: "NOTEBOOK_CHECK",
      title: "Diary check",
      fromDate: "2026-10-26",
      toDate: "2026-10-30",
      weekdays: [1, 2, 3, 4, 5],
    });
    expect(parsed.title).toBe("Diary check");
    expect(parsed.weekdays).toEqual([1, 2, 3, 4, 5]);
  });

  it("rejects ranges that would create too many tasks", () => {
    const result = createRecurringTasksBodySchema.safeParse({
      subjectId: "sub1",
      type: "DAILY_HOMEWORK",
      title: "HW",
      fromDate: "2026-10-26",
      toDate: "2026-11-08",
      weekdays: [1, 2, 3, 4, 5, 6, 7],
    });
    expect(result.success).toBe(false);
  });
});
