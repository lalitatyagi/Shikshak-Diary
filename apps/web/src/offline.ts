import type { ClassGridDto, StatusValue } from "@classroom-tracker/shared";

const GRID_PREFIX = "ct_grid_v1:";
const OUTBOX_KEY = "ct_status_outbox_v1";

export type StatusOutboxItem = {
  id: string;
  classId: string;
  statusId: string;
  status: StatusValue;
  /** Client version at queue time (base version before optimistic bump). */
  version: number;
  marks?: number | null;
  partsDone?: number | null;
  queuedAt: string;
};

function safeParseJson<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function cacheClassGrid(classId: string, grid: ClassGridDto): void {
  try {
    localStorage.setItem(`${GRID_PREFIX}${classId}`, JSON.stringify(grid));
  } catch {
    // Quota / private mode — ignore.
  }
}

export function readCachedClassGrid(classId: string): ClassGridDto | null {
  return safeParseJson<ClassGridDto>(
    localStorage.getItem(`${GRID_PREFIX}${classId}`),
  );
}

export function readStatusOutbox(): StatusOutboxItem[] {
  return (
    safeParseJson<StatusOutboxItem[]>(localStorage.getItem(OUTBOX_KEY)) ?? []
  );
}

function writeStatusOutbox(items: StatusOutboxItem[]): void {
  localStorage.setItem(OUTBOX_KEY, JSON.stringify(items));
}

export function enqueueStatusOutbox(
  item: Omit<StatusOutboxItem, "id" | "queuedAt">,
): StatusOutboxItem {
  const entry: StatusOutboxItem = {
    ...item,
    id: `${item.statusId}:${Date.now()}:${Math.random().toString(16).slice(2)}`,
    queuedAt: new Date().toISOString(),
  };
  const next = readStatusOutbox().filter(
    (row) => row.statusId !== item.statusId,
  );
  next.push(entry);
  writeStatusOutbox(next);
  return entry;
}

export function removeStatusOutboxItem(id: string): void {
  writeStatusOutbox(readStatusOutbox().filter((row) => row.id !== id));
}

export function clearStatusOutbox(): void {
  localStorage.removeItem(OUTBOX_KEY);
}

export function isLikelyOfflineError(error: unknown): boolean {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return true;
  }
  return error instanceof TypeError;
}
