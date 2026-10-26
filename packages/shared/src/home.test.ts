import { describe, expect, it } from "vitest";
import { homeResponseSchema, percentOrNull } from "./home.js";

describe("percentOrNull", () => {
  it("rounds a valid ratio and returns null when empty", () => {
    expect(percentOrNull(1, 2)).toBe(50);
    expect(percentOrNull(2, 3)).toBe(67);
    expect(percentOrNull(0, 0)).toBeNull();
    expect(percentOrNull(5, 0)).toBeNull();
  });
});

describe("homeResponseSchema", () => {
  it("accepts a class card with today tasks, week rates, and top defaulters", () => {
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
          attendancePresentPct: 92,
          homeworkDonePct: 78,
          topDefaulters: [
            {
              studentId: "s1",
              name: "Aarav",
              rollNumber: 1,
              missCount: 4,
            },
          ],
        },
      ],
    });
    expect(parsed.classes[0]?.pendingTodayCount).toBe(5);
    expect(parsed.classes[0]?.defaulterCount).toBe(2);
    expect(parsed.classes[0]?.attendancePresentPct).toBe(92);
    expect(parsed.classes[0]?.homeworkDonePct).toBe(78);
    expect(parsed.classes[0]?.topDefaulters).toHaveLength(1);
  });

  it("allows null week rates when nothing was marked", () => {
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
          todayTasks: [],
          pendingTodayCount: 0,
          defaulterCount: 0,
          attendancePresentPct: null,
          homeworkDonePct: null,
          topDefaulters: [],
        },
      ],
    });
    expect(parsed.classes[0]?.attendancePresentPct).toBeNull();
    expect(parsed.classes[0]?.homeworkDonePct).toBeNull();
  });
});
