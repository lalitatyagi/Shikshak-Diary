import { describe, expect, it } from "vitest";
import { homeResponseSchema } from "./home.js";

describe("homeResponseSchema", () => {
  it("accepts a class card with today tasks and counts", () => {
    const parsed = homeResponseSchema.parse({
      today: "2026-10-24",
      defaultersDays: 7,
      classes: [
        {
          id: "c1",
          schoolId: "s1",
          name: "8-B",
          academicYear: "2025-26",
          studentCount: 40,
          todayTasks: [
            {
              id: "t1",
              title: "Exercise 1",
              type: "DAILY_HOMEWORK",
              total: 40,
              pendingCount: 5,
            },
          ],
          pendingTodayCount: 5,
          defaulterCount: 2,
        },
      ],
    });
    expect(parsed.classes[0]?.pendingTodayCount).toBe(5);
    expect(parsed.classes[0]?.defaulterCount).toBe(2);
  });
});
