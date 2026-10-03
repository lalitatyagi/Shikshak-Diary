import { describe, expect, it } from "vitest";
import {
  completeStatusForType,
  isStatusAllowedForType,
  longPressStatuses,
  primaryTapStatus,
} from "./status-cycle.js";

describe("primaryTapStatus", () => {
  it("toggles DONE ↔ NOT_DONE for homework", () => {
    expect(primaryTapStatus("DAILY_HOMEWORK", "PENDING")).toBe("DONE");
    expect(primaryTapStatus("DAILY_HOMEWORK", "DONE")).toBe("NOT_DONE");
    expect(primaryTapStatus("DAILY_HOMEWORK", "NOT_DONE")).toBe("DONE");
  });

  it("toggles CHECKED ↔ NOT_CHECKED for notebook checks", () => {
    expect(primaryTapStatus("NOTEBOOK_CHECK", "PENDING")).toBe("CHECKED");
    expect(primaryTapStatus("NOTEBOOK_CHECK", "CHECKED")).toBe("NOT_CHECKED");
    expect(primaryTapStatus("NOTEBOOK_CHECK", "NOT_CHECKED")).toBe("CHECKED");
  });

  it("does not allow CHECKED on homework", () => {
    expect(isStatusAllowedForType("DAILY_HOMEWORK", "CHECKED")).toBe(false);
    expect(isStatusAllowedForType("NOTEBOOK_CHECK", "DONE")).toBe(false);
  });
});

describe("longPressStatuses", () => {
  it("offers incomplete, absent, and pending", () => {
    expect(longPressStatuses("DAILY_HOMEWORK")).toEqual([
      "INCOMPLETE",
      "ABSENT",
      "PENDING",
    ]);
  });
});

describe("completeStatusForType", () => {
  it("maps bulk complete to DONE or CHECKED by type", () => {
    expect(completeStatusForType("DAILY_HOMEWORK")).toBe("DONE");
    expect(completeStatusForType("NOTEBOOK_CHECK")).toBe("CHECKED");
  });
});
