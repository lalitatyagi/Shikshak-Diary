import { afterEach, describe, expect, it } from "vitest";
import {
  clearLastVisited,
  lastVisitedHref,
  readLastVisited,
  writeLastVisited,
} from "./lastVisited";

afterEach(() => {
  clearLastVisited();
});

describe("lastVisited", () => {
  it("round-trips class, path, and grid filters", () => {
    writeLastVisited({
      classId: "c1",
      className: "8-B",
      path: "grid",
      type: "DAILY_HOMEWORK",
      days: 7,
    });
    expect(readLastVisited()).toMatchObject({
      classId: "c1",
      className: "8-B",
      path: "grid",
      type: "DAILY_HOMEWORK",
      days: 7,
    });
  });

  it("builds hrefs for grid, students, and defaulters", () => {
    expect(
      lastVisitedHref({
        classId: "c1",
        path: "grid",
        type: "ATTENDANCE",
        days: 14,
        updatedAt: "2026-10-26T00:00:00.000Z",
      }),
    ).toBe("/classes/c1/grid?type=ATTENDANCE&days=14");
    expect(
      lastVisitedHref({
        classId: "c1",
        path: "students",
        updatedAt: "2026-10-26T00:00:00.000Z",
      }),
    ).toBe("/classes/c1/students");
    expect(
      lastVisitedHref({
        classId: "c2",
        path: "defaulters",
        updatedAt: "2026-10-26T00:00:00.000Z",
      }),
    ).toBe("/classes/c2/defaulters");
  });

  it("ignores invalid stored JSON", () => {
    localStorage.setItem("ct_last_visited_v1", "{not-json");
    expect(readLastVisited()).toBeNull();
  });
});
