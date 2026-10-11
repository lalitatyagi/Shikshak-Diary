import type { TaskStatusDto } from "@classroom-tracker/shared";
import { apiFetch } from "./api";
import { notifyOutboxChanged } from "./components/OfflineBanner";
import { readStatusOutbox, removeStatusOutboxItem } from "./offline";

let flushInFlight: Promise<void> | null = null;

/**
 * Replay queued status PUTs. Stops on hard failures that aren't conflicts;
 * drops items that succeed or return 409 (server won — UI should refetch).
 */
export async function flushStatusOutbox(): Promise<void> {
  if (flushInFlight) {
    return flushInFlight;
  }

  flushInFlight = (async () => {
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      return;
    }

    for (const item of readStatusOutbox()) {
      try {
        await apiFetch<TaskStatusDto>(`/task-statuses/${item.statusId}`, {
          method: "PUT",
          body: JSON.stringify({
            status: item.status,
            version: item.version,
            ...(item.marks !== undefined ? { marks: item.marks } : {}),
            ...(item.partsDone !== undefined
              ? { partsDone: item.partsDone }
              : {}),
          }),
        });
        removeStatusOutboxItem(item.id);
        notifyOutboxChanged();
      } catch (error) {
        const status =
          error && typeof error === "object" && "status" in error
            ? Number((error as { status: number }).status)
            : 0;
        if (status === 409 || status === 404) {
          removeStatusOutboxItem(item.id);
          notifyOutboxChanged();
          continue;
        }
        // Keep the rest of the queue for a later online event.
        break;
      }
    }
  })().finally(() => {
    flushInFlight = null;
  });

  return flushInFlight;
}

export function startOutboxSyncListener(): () => void {
  function onOnline() {
    void flushStatusOutbox();
  }
  window.addEventListener("online", onOnline);
  void flushStatusOutbox();
  return () => window.removeEventListener("online", onOnline);
}
