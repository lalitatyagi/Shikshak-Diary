import type { StatusValue, TaskType } from "./enums.js";

/** Bulk “mark all done” target for a task type. */
export function completeStatusForType(type: TaskType): StatusValue {
  if (type === "NOTEBOOK_CHECK") {
    return "CHECKED";
  }
  return "DONE";
}

export function incompletePairForType(type: TaskType): {
  done: StatusValue;
  notDone: StatusValue;
} {
  if (type === "NOTEBOOK_CHECK") {
    return { done: "CHECKED", notDone: "NOT_CHECKED" };
  }
  return { done: "DONE", notDone: "NOT_DONE" };
}

/**
 * Single tap: PENDING → done; then toggle done ↔ not-done.
 * INCOMPLETE / ABSENT tap returns to done (quick recover); set via long-press.
 */
export function primaryTapStatus(
  type: TaskType,
  current: StatusValue,
): StatusValue {
  const { done, notDone } = incompletePairForType(type);
  if (current === done) {
    return notDone;
  }
  if (current === notDone) {
    return done;
  }
  // PENDING, INCOMPLETE, ABSENT, or unexpected → mark done
  return done;
}

/** Long-press menu options (plus reset to pending). */
export function longPressStatuses(type: TaskType): StatusValue[] {
  void type;
  return ["INCOMPLETE", "ABSENT", "PENDING"];
}

export function isStatusAllowedForType(
  type: TaskType,
  status: StatusValue,
): boolean {
  const { done, notDone } = incompletePairForType(type);
  const allowed: StatusValue[] = [
    "PENDING",
    done,
    notDone,
    "INCOMPLETE",
    "ABSENT",
  ];
  return allowed.includes(status);
}

/** @deprecated Prefer primaryTapStatus + explicit PUT status. */
export function nextStatus(type: TaskType, current: StatusValue): StatusValue {
  return primaryTapStatus(type, current);
}

export function allowedStatusesForType(type: TaskType): StatusValue[] {
  const { done, notDone } = incompletePairForType(type);
  return ["PENDING", done, notDone, "INCOMPLETE", "ABSENT"];
}
