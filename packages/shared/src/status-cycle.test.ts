import { describe, expect, it } from "vitest";
import {
  allowedStatusesForType,
  completeStatusForType,
  isStatusAllowedForType,
  longPressStatuses,
  nextStatus,
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

describe("allowedStatusesForType / nextStatus", () => {
  it("lists the five statuses teachers can set per type", () => {
    expect(allowedStatusesForType("DAILY_HOMEWORK")).toEqual([
      "PENDING",
      "DONE",
      "NOT_DONE",
      "INCOMPLETE",
      "ABSENT",
    ]);
    expect(allowedStatusesForType("NOTEBOOK_CHECK")).toEqual([
      "PENDING",
      "CHECKED",
      "NOT_CHECKED",
      "INCOMPLETE",
      "ABSENT",
    ]);
  });

  it("keeps nextStatus as an alias of primaryTapStatus", () => {
    expect(nextStatus("WEEKLY_TEST", "INCOMPLETE")).toBe("DONE");
  });
});
