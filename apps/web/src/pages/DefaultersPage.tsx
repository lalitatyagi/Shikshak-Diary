import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import {
  DEFAULT_DEFAULTERS_DAYS,
  defaultersResponseSchema,
} from "@classroom-tracker/shared";
import { apiDownload, apiFetch } from "../api";

const DAY_OPTIONS = [7, 14, 30] as const;

export function DefaultersPage() {
  const { classId = "" } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const [exportError, setExportError] = useState<string | null>(null);
  const daysParam = Number(searchParams.get("days"));
  const days =
    Number.isInteger(daysParam) && daysParam >= 1 && daysParam <= 90
      ? daysParam
      : DEFAULT_DEFAULTERS_DAYS;

  const query = useQuery({
    queryKey: ["defaulters", classId, days],
    enabled: Boolean(classId),
    queryFn: async () =>
      defaultersResponseSchema.parse(
        await apiFetch<unknown>(`/classes/${classId}/defaulters?days=${days}`),
      ),
  });

  return (
    <main className="mx-auto min-h-screen max-w-lg px-4 py-6">
      <header className="mb-4">
        <div className="no-print flex items-center justify-between gap-2">
          <Link to="/" className="text-sm text-[var(--muted)] underline">
            ← Classes
          </Link>
          <Link
            to={`/classes/${classId}/grid`}
            className="text-sm text-[var(--accent)] underline"
          >
            Tick grid
          </Link>
        </div>
        <h1 className="mt-2 text-2xl font-semibold text-[var(--accent)]">
          Defaulters
        </h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Students with 2+ not-done / not-checked in the last {days} days
          {query.data ? ` (${query.data.fromDate} → ${query.data.toDate})` : ""}
          .
        </p>
      </header>

      <div className="no-print mb-4 flex gap-2">
        {DAY_OPTIONS.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => setSearchParams({ days: String(option) })}
            className={`min-h-11 flex-1 rounded-lg text-sm font-medium ${
              days === option
                ? "bg-[var(--accent)] text-white"
                : "bg-[var(--surface)] text-[var(--ink)] shadow-sm"
            }`}
          >
            {option}d
          </button>
        ))}
      </div>

      <div className="no-print mb-4 grid grid-cols-2 gap-2">
        <button
          type="button"
          disabled={!query.data}
          onClick={() => {
            setExportError(null);
            void apiDownload(
              `/classes/${classId}/defaulters.csv?days=${days}`,
              "defaulters.csv",
            ).catch(() => setExportError("Could not download CSV."));
          }}
          className="min-h-11 rounded-lg border border-[var(--accent)] text-sm font-medium text-[var(--accent)] disabled:opacity-40"
        >
          Download CSV
        </button>
        <button
          type="button"
          disabled={!query.data}
          onClick={() => window.print()}
          className="min-h-11 rounded-lg border border-[var(--accent)] text-sm font-medium text-[var(--accent)] disabled:opacity-40"
        >
          Print / PDF
        </button>
      </div>
      {exportError && (
        <p className="no-print mb-4 text-sm text-red-700">{exportError}</p>
      )}

      {query.isPending && (
        <p className="text-[var(--muted)]">Loading defaulters…</p>
      )}
      {query.isError && (
        <p className="text-red-700">Could not load defaulters.</p>
      )}

      {query.data && query.data.defaulters.length === 0 && (
        <p className="rounded-xl bg-[var(--surface)] px-4 py-6 text-[var(--muted)] shadow-sm">
          No students with {query.data.minMisses}+ misses in this window.
        </p>
      )}

      <ul className="space-y-3">
        {(query.data?.defaulters ?? []).map((row) => (
          <li
            key={row.student.id}
            className="rounded-xl bg-[var(--surface)] px-4 py-3 shadow-sm"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-lg font-medium">
                  <span className="text-[var(--muted)]">
                    #{row.student.rollNumber}
                  </span>{" "}
                  {row.student.name}
                </p>
                {row.taskTitles.length > 0 && (
                  <p className="mt-1 text-sm text-[var(--muted)]">
                    {row.taskTitles.join(" · ")}
                  </p>
                )}
                <Link
                  to={`/classes/${classId}/students/${row.student.id}/report`}
                  className="mt-2 inline-block text-sm text-[var(--accent)] underline"
                >
                  View report
                </Link>
              </div>
              <span className="shrink-0 rounded-lg bg-red-700 px-2 py-1 text-sm font-semibold text-white">
                {row.missCount}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </main>
  );
}
