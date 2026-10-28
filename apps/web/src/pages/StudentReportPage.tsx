import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import {
  canManageParentLinks,
  DEFAULT_REPORT_DAYS,
  parentLinkCreatedSchema,
  parentLinkStatusSchema,
  studentReportSchema,
} from "@classroom-tracker/shared";
import { apiDownload, apiFetch } from "../api";
import { useAuth } from "../auth";
import { StudentReportView } from "../components/StudentReportView";

const DAY_OPTIONS = [7, 14, 30, 90] as const;

export function StudentReportPage() {
  const { classId = "", studentId = "" } = useParams();
  const { user } = useAuth();
  const canShare = user ? canManageParentLinks(user.role) : false;
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const [freshUrl, setFreshUrl] = useState<string | null>(null);
  const [copyNote, setCopyNote] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  const daysParam = Number(searchParams.get("days"));
  const days =
    Number.isInteger(daysParam) && daysParam >= 1 && daysParam <= 365
      ? daysParam
      : DEFAULT_REPORT_DAYS;

  const reportQuery = useQuery({
    queryKey: ["student-report", classId, studentId, days],
    enabled: Boolean(classId && studentId),
    queryFn: async () =>
      studentReportSchema.parse(
        await apiFetch<unknown>(
          `/classes/${classId}/students/${studentId}/report?days=${days}`,
        ),
      ),
  });

  const linkQuery = useQuery({
    queryKey: ["parent-link", classId, studentId],
    enabled: Boolean(classId && studentId && canShare),
    queryFn: async () =>
      parentLinkStatusSchema.parse(
        await apiFetch<unknown>(
          `/classes/${classId}/students/${studentId}/parent-link`,
        ),
      ),
  });

  const createLink = useMutation({
    mutationFn: async () =>
      parentLinkCreatedSchema.parse(
        await apiFetch<unknown>(
          `/classes/${classId}/students/${studentId}/parent-link`,
          { method: "POST", body: JSON.stringify({}) },
        ),
      ),
    onSuccess: (created) => {
      const url = `${window.location.origin}${created.path}`;
      setFreshUrl(url);
      setCopyNote(null);
      void queryClient.invalidateQueries({
        queryKey: ["parent-link", classId, studentId],
      });
    },
  });

  const revokeLink = useMutation({
    mutationFn: async () =>
      parentLinkStatusSchema.parse(
        await apiFetch<unknown>(
          `/classes/${classId}/students/${studentId}/parent-link`,
          { method: "DELETE" },
        ),
      ),
    onSuccess: () => {
      setFreshUrl(null);
      setCopyNote(null);
      void queryClient.invalidateQueries({
        queryKey: ["parent-link", classId, studentId],
      });
    },
  });

  async function copyUrl(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopyNote("Copied");
    } catch {
      setCopyNote("Copy failed — select the link manually");
    }
  }

  async function shareUrl(url: string) {
    const studentName = reportQuery.data?.student.name ?? "student";
    const title = `Classroom Tracker report — ${studentName}`;
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title, text: title, url });
        setCopyNote("Shared");
        return;
      } catch {
        // Cancelled or unsupported — fall through to WhatsApp / copy.
      }
    }
    const wa = `https://wa.me/?text=${encodeURIComponent(`${title}\n${url}`)}`;
    window.open(wa, "_blank", "noopener,noreferrer");
  }

  function whatsappHref(url: string): string {
    const studentName = reportQuery.data?.student.name ?? "student";
    const text = `Classroom Tracker report — ${studentName}\n${url}`;
    return `https://wa.me/?text=${encodeURIComponent(text)}`;
  }

  const linkActive = linkQuery.data?.link?.active === true;

  return (
    <main className="mx-auto min-h-screen max-w-lg px-4 py-6">
      <header className="mb-4">
        <div className="no-print flex items-center justify-between gap-2">
          <Link
            to={`/classes/${classId}/students`}
            className="text-sm text-[var(--muted)] underline"
          >
            ← Students
          </Link>
          <Link
            to={`/classes/${classId}/grid`}
            className="text-sm text-[var(--accent)] underline"
          >
            Marking sheet
          </Link>
        </div>
        <h1 className="mt-2 text-2xl font-semibold text-[var(--accent)]">
          {reportQuery.data
            ? `#${reportQuery.data.student.rollNumber} ${reportQuery.data.student.name}`
            : "Student report"}
        </h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Last {days} days
          {reportQuery.data
            ? ` (${reportQuery.data.fromDate} → ${reportQuery.data.toDate})`
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
          disabled={!reportQuery.data}
          onClick={() => {
            setExportError(null);
            void apiDownload(
              `/classes/${classId}/students/${studentId}/report.csv?days=${days}`,
              `student-report.csv`,
            ).catch(() => setExportError("Could not download CSV."));
          }}
          className="min-h-11 rounded-lg border border-[var(--accent)] text-sm font-medium text-[var(--accent)] disabled:opacity-40"
        >
          Download CSV
        </button>
        <button
          type="button"
          disabled={!reportQuery.data}
          onClick={() => window.print()}
          className="min-h-11 rounded-lg border border-[var(--accent)] text-sm font-medium text-[var(--accent)] disabled:opacity-40"
        >
          Print / PDF
        </button>
      </div>
      {exportError && (
        <p className="no-print mb-4 text-sm text-red-700">{exportError}</p>
      )}

      {canShare && (
        <section className="no-print mb-6 rounded-xl bg-[var(--surface)] px-4 py-3 shadow-sm">
          <h2 className="text-sm font-semibold text-[var(--ink)]">
            Parent link
          </h2>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Share a read-only report URL. Creating again replaces the old link.
          </p>
          {linkActive && linkQuery.data?.link && (
            <p className="mt-2 text-sm text-[var(--muted)]">
              Active until{" "}
              {new Date(linkQuery.data.link.expiresAt).toLocaleDateString()}
            </p>
          )}
          {freshUrl && (
            <div className="mt-3 space-y-2">
              <p className="break-all rounded-lg bg-[var(--ink)]/5 px-3 py-2 text-sm">
                {freshUrl}
              </p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => void copyUrl(freshUrl)}
                  className="min-h-11 rounded-lg border border-[var(--accent)] text-sm font-medium text-[var(--accent)]"
                >
                  Copy link
                </button>
                <button
                  type="button"
                  onClick={() => void shareUrl(freshUrl)}
                  className="min-h-11 rounded-lg border border-[var(--accent)] text-sm font-medium text-[var(--accent)]"
                >
                  Share
                </button>
              </div>
              <a
                href={whatsappHref(freshUrl)}
                target="_blank"
                rel="noopener noreferrer"
                className="flex min-h-11 items-center justify-center rounded-lg bg-[var(--accent)] text-sm font-medium text-white"
              >
                WhatsApp
              </a>
              {copyNote && (
                <p className="text-sm text-[var(--muted)]">{copyNote}</p>
              )}
            </div>
          )}
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={createLink.isPending}
              onClick={() => createLink.mutate()}
              className="min-h-11 rounded-lg bg-[var(--accent)] text-sm font-medium text-white disabled:opacity-60"
            >
              {linkActive ? "New link" : "Create link"}
            </button>
            <button
              type="button"
              disabled={!linkActive || revokeLink.isPending}
              onClick={() => revokeLink.mutate()}
              className="min-h-11 rounded-lg border border-red-700 text-sm font-medium text-red-700 disabled:opacity-40"
            >
              Revoke
            </button>
          </div>
          {(createLink.isError || revokeLink.isError) && (
            <p className="mt-2 text-sm text-red-700">Could not update link.</p>
          )}
        </section>
      )}

      {reportQuery.isPending && (
        <p className="text-[var(--muted)]">Loading report…</p>
      )}
      {reportQuery.isError && (
        <p className="text-red-700">Could not load report.</p>
      )}

      {reportQuery.data && <StudentReportView report={reportQuery.data} />}
    </main>
  );
}
