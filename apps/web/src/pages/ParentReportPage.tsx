import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import {
  DEFAULT_REPORT_DAYS,
  studentReportSchema,
} from "@classroom-tracker/shared";
import { apiBaseUrl, publicDownload } from "../api";
import { StudentReportView } from "../components/StudentReportView";

const DAY_OPTIONS = [7, 14, 30, 90] as const;

async function fetchPublicReport(token: string, days: number) {
  const res = await fetch(
    `${apiBaseUrl()}/parent/${encodeURIComponent(token)}/report?days=${days}`,
  );
  if (!res.ok) {
    throw new Error("Could not load report");
  }
  return studentReportSchema.parse(await res.json());
}

export function ParentReportPage() {
  const { token = "" } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const [exportError, setExportError] = useState<string | null>(null);
  const daysParam = Number(searchParams.get("days"));
  const days =
    Number.isInteger(daysParam) && daysParam >= 1 && daysParam <= 365
      ? daysParam
      : DEFAULT_REPORT_DAYS;

  const query = useQuery({
    queryKey: ["parent-report", token, days],
    enabled: token.length >= 32,
    queryFn: () => fetchPublicReport(token, days),
  });

  return (
    <main className="mx-auto min-h-screen max-w-lg px-4 py-6">
      <header className="mb-4">
        <p className="text-sm text-[var(--muted)]">Classroom Tracker</p>
        <h1 className="mt-1 text-2xl font-semibold text-[var(--accent)]">
          {query.data
            ? `#${query.data.student.rollNumber} ${query.data.student.name}`
            : "Student report"}
        </h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Last {days} days
          {query.data
            ? ` (${query.data.fromDate} → ${query.data.toDate})`
            : ""}
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
            void publicDownload(
              `/parent/${encodeURIComponent(token)}/report.csv?days=${days}`,
              "student-report.csv",
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
        <p className="text-[var(--muted)]">Loading report…</p>
      )}
      {query.isError && (
        <p className="text-red-700">
          This link is invalid, expired, or has been revoked.
        </p>
      )}

      {query.data && <StudentReportView report={query.data} />}
    </main>
  );
}
