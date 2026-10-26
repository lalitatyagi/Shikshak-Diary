import { describe, expect, it } from "vitest";
import { updateStudentBodySchema } from "./classes.js";

describe("updateStudentBodySchema", () => {
  it("normalizes Indian mobiles to E.164", () => {
    expect(
      updateStudentBodySchema.parse({ parentContact: "9876543210" }),
    ).toEqual({ parentContact: "+919876543210" });
    expect(
      updateStudentBodySchema.parse({ parentContact: "+91 98765 43210" }),
    ).toEqual({ parentContact: "+919876543210" });
  });

  it("clears blank or null contact", () => {
    expect(updateStudentBodySchema.parse({ parentContact: "" })).toEqual({
      parentContact: null,
    });
    expect(updateStudentBodySchema.parse({ parentContact: "  " })).toEqual({
      parentContact: null,
    });
    expect(updateStudentBodySchema.parse({ parentContact: null })).toEqual({
      parentContact: null,
    });
  });

  it("rejects invalid numbers", () => {
    expect(
      updateStudentBodySchema.safeParse({ parentContact: "12345" }).success,
    ).toBe(false);
  });
});
