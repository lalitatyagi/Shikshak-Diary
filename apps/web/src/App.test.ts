import { describe, expect, it } from "vitest";
import { healthResponseSchema } from "@classroom-tracker/shared";

describe("web health client contract", () => {
  it("parses the API health shape used by the home screen", () => {
    const parsed = healthResponseSchema.parse({
      status: "ok",
      service: "classroom-tracker-api",
      timestamp: "2026-10-02T12:00:00.000Z",
    });

    expect(parsed.status).toBe("ok");
  });
});
