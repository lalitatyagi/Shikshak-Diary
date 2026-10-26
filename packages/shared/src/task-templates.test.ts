import { describe, expect, it } from "vitest";
import {
  DEFAULT_DAILY_HOMEWORK_TITLE,
  findTodaysDailyHomework,
  suggestDailyHomeworkTitle,
  todayHomeworkBodySchema,
} from "./task-templates.js";

describe("suggestDailyHomeworkTitle", () => {
  it("returns the default when there is no prior daily homework", () => {
    expect(suggestDailyHomeworkTitle([], "2026-10-26")).toBe(
      DEFAULT_DAILY_HOMEWORK_TITLE,
    );
    expect(
      suggestDailyHomeworkTitle(
        [
          {
            type: "NOTEBOOK_CHECK",
            title: "Notebook",
            assignedOn: "2026-10-25",
          },
        ],
        "2026-10-26",
      ),
    ).toBe(DEFAULT_DAILY_HOMEWORK_TITLE);
  });

  it("repeats the most recent prior day's daily homework title", () => {
    expect(
      suggestDailyHomeworkTitle(
        [
          {
            type: "DAILY_HOMEWORK",
            title: "Exercise 1.1",
            assignedOn: "2026-10-24",
          },
          {
            type: "DAILY_HOMEWORK",
            title: "Exercise 1.2",
            assignedOn: "2026-10-25",
          },
          {
            type: "DAILY_HOMEWORK",
            title: "Today already",
            assignedOn: "2026-10-26",
          },
        ],
        "2026-10-26",
      ),
    ).toBe("Exercise 1.2");
  });
});

describe("findTodaysDailyHomework", () => {
  it("finds today's daily homework only", () => {
    const tasks = [
      {
        type: "DAILY_HOMEWORK",
        title: "Old",
        assignedOn: "2026-10-25",
      },
      {
        type: "DAILY_HOMEWORK",
        title: "Today",
        assignedOn: "2026-10-26",
      },
    ];
    expect(findTodaysDailyHomework(tasks, "2026-10-26")?.title).toBe("Today");
    expect(findTodaysDailyHomework(tasks, "2026-10-27")).toBeUndefined();
  });
});

describe("todayHomeworkBodySchema", () => {
  it("allows empty body and trims title", () => {
    expect(todayHomeworkBodySchema.parse({})).toEqual({});
    expect(todayHomeworkBodySchema.parse({ title: "  Worksheet  " })).toEqual({
      title: "Worksheet",
    });
  });
});
