import { describe, expect, it } from "vitest";
import { primaryTapStatus } from "@classroom-tracker/shared";

describe("tick grid tap contract", () => {
  it("toggles DONE ↔ NOT_DONE after mark-all style states", () => {
    expect(primaryTapStatus("DAILY_HOMEWORK", "DONE")).toBe("NOT_DONE");
    expect(primaryTapStatus("DAILY_HOMEWORK", "NOT_DONE")).toBe("DONE");
    expect(primaryTapStatus("NOTEBOOK_CHECK", "CHECKED")).toBe("NOT_CHECKED");
  });
});
