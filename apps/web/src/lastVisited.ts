import { taskTypeSchema, type TaskType } from "@classroom-tracker/shared";

const STORAGE_KEY = "ct_last_visited_v1";

export type LastVisitedPath = "grid" | "students" | "defaulters";

export type LastVisited = {
  classId: string;
  className?: string;
  path: LastVisitedPath;
  /** Grid type filter when path is grid. */
  type?: TaskType;
  /** Grid days filter when path is grid. */
  days?: number;
  updatedAt: string;
};

function safeParse(raw: string | null): LastVisited | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<LastVisited>;
    if (typeof value.classId !== "string" || value.classId.length === 0) {
      return null;
    }
    const path =
      value.path === "students" || value.path === "defaulters"
        ? value.path
        : "grid";
    const typeParsed = taskTypeSchema.safeParse(value.type);
    const days =
      typeof value.days === "number" &&
      Number.isInteger(value.days) &&
      value.days >= 1 &&
      value.days <= 365
        ? value.days
        : undefined;
    return {
      classId: value.classId,
      className:
        typeof value.className === "string" && value.className.trim()
          ? value.className.trim()
          : undefined,
      path,
      type: typeParsed.success ? typeParsed.data : undefined,
      days,
      updatedAt:
        typeof value.updatedAt === "string"
          ? value.updatedAt
          : new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

export function readLastVisited(): LastVisited | null {
  try {
    return safeParse(localStorage.getItem(STORAGE_KEY));
  } catch {
    return null;
  }
}

export function writeLastVisited(
  input: Omit<LastVisited, "updatedAt"> & { updatedAt?: string },
): void {
  try {
    const next: LastVisited = {
      classId: input.classId,
      className: input.className,
      path: input.path,
      type: input.type,
      days: input.days,
      updatedAt: input.updatedAt ?? new Date().toISOString(),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Quota / private mode — ignore.
  }
}

export function clearLastVisited(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

/** Deep link back to the last class screen (grid filters restored when saved). */
export function lastVisitedHref(visit: LastVisited): string {
  if (visit.path === "students") {
    return `/classes/${visit.classId}/students`;
  }
  if (visit.path === "defaulters") {
    return `/classes/${visit.classId}/defaulters`;
  }
  const params = new URLSearchParams();
  if (visit.type) params.set("type", visit.type);
  if (visit.days != null) params.set("days", String(visit.days));
  const qs = params.toString();
  return `/classes/${visit.classId}/grid${qs ? `?${qs}` : ""}`;
}
