import { describe, expect, it } from "vitest";
import { createClassBodySchema, csvImportBodySchema } from "./classes.js";

describe("createClassBodySchema", () => {
  it("defaults subjectName to General", () => {
    const parsed = createClassBodySchema.parse({
      schoolId: "school_1",
      name: "8-B",
      academicYear: "2025-26",
    });
    expect(parsed.subjectName).toBe("General");
  });
});

describe("csvImportBodySchema", () => {
  it("rejects empty csv", () => {
    expect(csvImportBodySchema.safeParse({ csv: "" }).success).toBe(false);
  });
});
