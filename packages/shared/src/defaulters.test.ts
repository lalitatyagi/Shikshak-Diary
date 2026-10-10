import { describe, expect, it } from "vitest";
import {
  DEFAULT_DEFAULTERS_DAYS,
  DEFAULT_MIN_MISSES,
  defaultersQuerySchema,
  defaultersResponseSchema,
} from "./defaulters.js";
import { addKolkataCalendarDays, defaultersWindow } from "./dates.js";

describe("defaulters window", () => {
  it("builds an inclusive last-N-days Kolkata window", () => {
    const now = new Date("2026-10-03T14:30:00.000Z"); // 3 Oct evening IST
    expect(defaultersWindow(7, now)).toEqual({
      fromDate: "2026-09-27",
      toDate: "2026-10-03",
    });
    expect(defaultersWindow(1, now)).toEqual({
      fromDate: "2026-10-03",
      toDate: "2026-10-03",
    });
  });

  it("shifts calendar days across month boundaries", () => {
    expect(addKolkataCalendarDays("2026-10-01", -1)).toBe("2026-09-30");
    expect(addKolkataCalendarDays("2026-09-30", 3)).toBe("2026-10-03");
  });
});

describe("defaulters schemas", () => {
  it("defaults days and coerces query strings", () => {
    expect(defaultersQuerySchema.parse({})).toEqual({
      days: DEFAULT_DEFAULTERS_DAYS,
    });
    expect(defaultersQuerySchema.parse({ days: "14" })).toEqual({ days: 14 });
    expect(defaultersQuerySchema.safeParse({ days: 0 }).success).toBe(false);
    expect(defaultersQuerySchema.safeParse({ days: 91 }).success).toBe(false);
  });

  it("accepts a valid response shape", () => {
    const parsed = defaultersResponseSchema.parse({
      classId: "c1",
      days: 7,
      fromDate: "2026-09-27",
      toDate: "2026-10-03",
      minMisses: DEFAULT_MIN_MISSES,
      defaulters: [
        {
          student: {
            id: "s1",
            schoolId: "sch1",
            name: "Aarav",
            rollNumber: 1,
            parentContact: null,
          },
          missCount: 2,
          taskTitles: ["Exercise 1.1", "Notebook check"],
        },
      ],
    });
    expect(parsed.defaulters).toHaveLength(1);
  });
});
