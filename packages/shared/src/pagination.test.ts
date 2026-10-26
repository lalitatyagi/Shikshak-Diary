import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  gridQuerySchema,
  paginatedResponseSchema,
  studentsListQuerySchema,
  tasksListQuerySchema,
  toPaginated,
} from "./pagination.js";

describe("studentsListQuerySchema", () => {
  it("defaults page and pageSize", () => {
    expect(studentsListQuerySchema.parse({})).toEqual({
      page: 1,
      pageSize: 40,
      q: undefined,
      missingContact: undefined,
    });
  });

  it("trims empty q to undefined", () => {
    expect(studentsListQuerySchema.parse({ q: "  " }).q).toBeUndefined();
  });

  it("parses missingContact flag", () => {
    expect(studentsListQuerySchema.parse({ missingContact: "1" }).missingContact).toBe(
      true,
    );
    expect(
      studentsListQuerySchema.parse({ missingContact: "false" }).missingContact,
    ).toBe(false);
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

describe("tasksListQuerySchema", () => {
  it("accepts an optional task type filter", () => {
    expect(tasksListQuerySchema.parse({ type: "NOTEBOOK_CHECK" })).toEqual({
      page: 1,
      pageSize: 40,
      type: "NOTEBOOK_CHECK",
    });
  });
});

describe("paginatedResponseSchema", () => {
  it("validates a list envelope", () => {
    const schema = paginatedResponseSchema(z.string());
    expect(
      schema.parse({
        items: ["a"],
        page: 1,
        pageSize: 40,
        total: 1,
        totalPages: 1,
      }),
    ).toMatchObject({ total: 1, items: ["a"] });
  });
});
