import { useOnline } from "../hooks/useOnline";
import { readStatusOutbox } from "../offline";
import { useEffect, useState } from "react";

export function OfflineBanner() {
  const online = useOnline();
  const [pending, setPending] = useState(0);

  useEffect(() => {
    function refresh() {
      setPending(readStatusOutbox().length);
    }
    refresh();
    window.addEventListener("ct-outbox-changed", refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener("ct-outbox-changed", refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  if (online && pending === 0) {
    return null;
  }

  return (
    <div
      role="status"
      className={`px-4 py-2 text-center text-sm font-medium ${
        online ? "bg-amber-100 text-amber-950" : "bg-slate-800 text-white"
      }`}
    >
      {online
        ? `Syncing ${pending} offline mark${pending === 1 ? "" : "s"}…`
        : pending > 0
          ? `Offline — ${pending} mark${pending === 1 ? "" : "s"} queued`
          : "Offline — showing cached data when available"}
    </div>
  );
}

export function notifyOutboxChanged(): void {
  window.dispatchEvent(new Event("ct-outbox-changed"));
}
