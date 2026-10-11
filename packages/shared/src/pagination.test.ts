import { describe, expect, it } from "vitest";
import {
  gridQuerySchema,
  studentsListQuerySchema,
  toPaginated,
} from "./pagination.js";

describe("studentsListQuerySchema", () => {
  it("defaults page and pageSize", () => {
    expect(studentsListQuerySchema.parse({})).toEqual({
      page: 1,
      pageSize: 40,
      q: undefined,
    });
  });

  it("trims empty q to undefined", () => {
    expect(studentsListQuerySchema.parse({ q: "  " }).q).toBeUndefined();
  });
});

describe("gridQuerySchema", () => {
  it("accepts type and days", () => {
    expect(
      gridQuerySchema.parse({ type: "WEEKLY_TEST", days: "14", q: "Aarav" }),
    ).toEqual({
      type: "WEEKLY_TEST",
      days: 14,
      q: "Aarav",
    });
  });
});

describe("toPaginated", () => {
  it("computes totalPages", () => {
    expect(toPaginated(["a"], 41, 1, 40)).toEqual({
      items: ["a"],
      page: 1,
      pageSize: 40,
      total: 41,
      totalPages: 2,
    });
    expect(toPaginated([], 0, 1, 40).totalPages).toBe(0);
  });
});
