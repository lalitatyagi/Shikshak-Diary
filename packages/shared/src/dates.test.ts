import { describe, expect, it } from "vitest";
import {
  isPastDueInKolkata,
  kolkataCalendarDateToInstant,
  parseToKolkataCalendarDate,
  toKolkataCalendarDate,
} from "./dates.js";

describe("Kolkata calendar dates", () => {
  it("maps YYYY-MM-DD to midnight Asia/Kolkata, not UTC midnight", () => {
    const instant = kolkataCalendarDateToInstant("2026-10-03");
    // 00:00 IST = 18:30 UTC previous calendar day
    expect(instant.toISOString()).toBe("2026-10-02T18:30:00.000Z");
    expect(toKolkataCalendarDate(instant)).toBe("2026-10-03");
  });

  it("does not shift the calendar day around an IST evening UTC instant", () => {
    // 2026-10-03 20:00 IST = 2026-10-03T14:30:00.000Z
    const eveningIst = new Date("2026-10-03T14:30:00.000Z");
    expect(toKolkataCalendarDate(eveningIst)).toBe("2026-10-03");

    // 2026-10-03 00:30 IST = 2026-10-02T19:00:00.000Z — still 3 Oct in India
    const earlyIst = new Date("2026-10-02T19:00:00.000Z");
    expect(toKolkataCalendarDate(earlyIst)).toBe("2026-10-03");

    // UTC midnight on 3 Oct is still 3 Oct 05:30 IST
    expect(toKolkataCalendarDate(new Date("2026-10-03T00:00:00.000Z"))).toBe(
      "2026-10-03",
    );
  });

  it("parses ISO datetimes into the Kolkata calendar date", () => {
    expect(parseToKolkataCalendarDate("2026-10-03T00:00:00.000Z")).toBe(
      "2026-10-03",
    );
    expect(parseToKolkataCalendarDate("2026-10-03")).toBe("2026-10-03");
  });

  it("treats past-due using Kolkata calendar days", () => {
    const due = kolkataCalendarDateToInstant("2026-10-02");
    const now = new Date("2026-10-03T01:00:00.000Z"); // still 3 Oct morning IST
    expect(isPastDueInKolkata(due, now)).toBe(true);
    expect(
      isPastDueInKolkata(kolkataCalendarDateToInstant("2026-10-03"), now),
    ).toBe(false);
  });
});
