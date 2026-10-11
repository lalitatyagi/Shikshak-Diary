import { beforeEach, describe, expect, it } from "vitest";
import {
  cacheClassGrid,
  enqueueStatusOutbox,
  isLikelyOfflineError,
  readCachedClassGrid,
  readStatusOutbox,
  removeStatusOutboxItem,
} from "./offline";
import type { ClassGridDto } from "@classroom-tracker/shared";

const sampleGrid = {
  class: { id: "c1", name: "8-B", academicYear: "2025-26" },
  defaultSubjectId: "sub1",
  students: [],
  tasks: [],
  statuses: [],
} as ClassGridDto;

describe("offline cache and outbox", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("round-trips a cached grid", () => {
    cacheClassGrid("c1", sampleGrid);
    expect(readCachedClassGrid("c1")?.class.name).toBe("8-B");
  });

  it("keeps only the latest outbox entry per statusId", () => {
    enqueueStatusOutbox({
      classId: "c1",
      statusId: "s1",
      status: "DONE",
      version: 1,
    });
    enqueueStatusOutbox({
      classId: "c1",
      statusId: "s1",
      status: "NOT_DONE",
      version: 2,
    });
    const box = readStatusOutbox();
    expect(box).toHaveLength(1);
    expect(box[0]!.status).toBe("NOT_DONE");
    removeStatusOutboxItem(box[0]!.id);
    expect(readStatusOutbox()).toHaveLength(0);
  });

  it("detects TypeError as offline-ish", () => {
    expect(isLikelyOfflineError(new TypeError("Failed to fetch"))).toBe(true);
    expect(isLikelyOfflineError(new Error("nope"))).toBe(false);
  });
});
