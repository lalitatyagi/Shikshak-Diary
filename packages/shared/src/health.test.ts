import { describe, expect, it } from "vitest";
import { healthResponseSchema } from "./health.js";

describe("healthResponseSchema", () => {
  it("accepts a valid health payload", () => {
    const result = healthResponseSchema.safeParse({
      status: "ok",
      service: "api",
      timestamp: "2026-10-02T12:00:00.000Z",
    });

    expect(result.success).toBe(true);
  });

  it("rejects an invalid status", () => {
    const result = healthResponseSchema.safeParse({
      status: "down",
      service: "api",
      timestamp: "2026-10-02T12:00:00.000Z",
    });

    expect(result.success).toBe(false);
  });
});
