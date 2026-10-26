import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import {
  DEFAULT_DEFAULTERS_DAYS,
  defaulterWhatsAppMessage,
  defaultersClassGroupMessage,
  defaultersResponseSchema,
  toWhatsAppDigits,
  whatsappChatHref,
  whatsappShareHref,
  type DefaulterRow,
} from "@classroom-tracker/shared";
import { apiDownload, apiFetch } from "../api";
import { writeLastVisited } from "../lastVisited";

const DAY_OPTIONS = [7, 14, 30] as const;

function messageForRow(row: DefaulterRow, days: number): string {
  return defaulterWhatsAppMessage({
    studentName: row.student.name,
    rollNumber: row.student.rollNumber,
    missCount: row.missCount,
    days,
    taskTitles: row.taskTitles,
  });
}

export function DefaultersPage() {
  const { classId = "" } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const [exportError, setExportError] = useState<string | null>(null);
  const [copyNote, setCopyNote] = useState<string | null>(null);
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

  useEffect(() => {
    if (!classId) return;
    writeLastVisited({
      classId,
      className: query.data?.className,
      path: "defaulters",
    });
  }, [classId, query.data?.className]);

  const withPhone = useMemo(() => {
    const rows = query.data?.defaulters ?? [];
    return rows
      .map((row) => {
        const digits = toWhatsAppDigits(row.student.parentContact);
        if (!digits) return null;
        return { row, digits, text: messageForRow(row, days) };
      })
      .filter((item): item is NonNullable<typeof item> => item != null);
  }, [query.data, days]);

  const groupMessage = useMemo(() => {
    if (!query.data) return "";
    return defaultersClassGroupMessage({
      className: query.data.className,
      days: query.data.days,
      defaulters: query.data.defaulters.map((row) => ({
        rollNumber: row.student.rollNumber,
        name: row.student.name,
        missCount: row.missCount,
      })),
    });
  }, [query.data]);

  async function copyText(label: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopyNote(label);
    } catch {
      setCopyNote("Copy failed — use Share to group or WhatsApp per student");
    }
  }

  async function copyGroupList() {
    if (!query.data || query.data.defaulters.length === 0) {
      setCopyNote("No defaulters to copy.");
      return;
    }
    await copyText("Copied class-group list", groupMessage);
  }

  async function copyAllParentMessages() {
    if (withPhone.length === 0) {
      setCopyNote("No parent numbers on this list.");
      return;
    }
    const blob = withPhone
      .map(
        ({ row, text }) =>
          `#${row.student.rollNumber} ${row.student.name}\n${text}`,
      )
      .join("\n\n---\n\n");
    await copyText(`Copied ${withPhone.length} parent message(s)`, blob);
  }

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

      {query.data && query.data.defaulters.length > 0 && (
        <div className="no-print mb-4 space-y-3 rounded-xl bg-[var(--surface)] px-4 py-3 shadow-sm">
          <div>
            <p className="text-sm font-medium text-[var(--ink)]">
              Class WhatsApp group
            </p>
            <p className="mt-0.5 text-sm text-[var(--muted)]">
              One list for the group chat — pick the chat in WhatsApp after tap.
            </p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <a
                href={whatsappShareHref(groupMessage)}
                target="_blank"
                rel="noopener noreferrer"
                className="flex min-h-11 items-center justify-center rounded-lg bg-[var(--accent)] text-sm font-medium text-white"
              >
                Share to group
              </a>
              <button
                type="button"
                onClick={() => void copyGroupList()}
                className="min-h-11 rounded-lg border border-[var(--accent)] text-sm font-medium text-[var(--accent)]"
              >
                Copy group list
              </button>
            </div>
          </div>

          <div className="border-t border-emerald-900/10 pt-3">
            <p className="text-sm font-medium text-[var(--ink)]">
              Individual parents
            </p>
            <p className="mt-0.5 text-sm text-[var(--muted)]">
              {withPhone.length} of {query.data.defaulters.length} have a parent
              number
              {withPhone.length < query.data.defaulters.length ? (
                <>
                  {" "}
                  —{" "}
                  <Link
                    to={`/classes/${classId}/students?missingContact=1`}
                    className="font-medium text-[var(--accent)] underline"
                  >
                    add missing phones
                  </Link>
                </>
              ) : null}
              .
            </p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={withPhone.length === 0}
                onClick={() => void copyAllParentMessages()}
                className="min-h-11 rounded-lg border border-[var(--accent)] text-sm font-medium text-[var(--accent)] disabled:opacity-40"
              >
                Copy parent texts
              </button>
              <a
                href={
                  withPhone[0]
                    ? whatsappChatHref(withPhone[0].digits, withPhone[0].text)
                    : undefined
                }
                target="_blank"
                rel="noopener noreferrer"
                aria-disabled={withPhone.length === 0}
                className={`flex min-h-11 items-center justify-center rounded-lg border border-[var(--accent)] text-sm font-medium text-[var(--accent)] ${
                  withPhone.length === 0 ? "pointer-events-none opacity-40" : ""
                }`}
              >
                Message first
              </a>
            </div>
          </div>
          {copyNote && (
            <p className="text-sm text-[var(--muted)]">{copyNote}</p>
          )}
        </div>
      )}

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
        {(query.data?.defaulters ?? []).map((row) => {
          const digits = toWhatsAppDigits(row.student.parentContact);
          const text = messageForRow(row, days);
          return (
            <li
              key={row.student.id}
              className="rounded-xl bg-[var(--surface)] px-4 py-3 shadow-sm"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
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
                  <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-sm">
                    <Link
                      to={`/classes/${classId}/students/${row.student.id}/report`}
                      className="text-[var(--accent)] underline"
                    >
                      View report
                    </Link>
                    {digits ? (
                      <a
                        href={whatsappChatHref(digits, text)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium text-[var(--accent)] underline"
                      >
                        WhatsApp
                      </a>
                    ) : (
                      <span className="text-[var(--muted)]">
                        No parent phone
                      </span>
                    )}
                  </div>
                </div>
                <span className="shrink-0 rounded-lg bg-red-700 px-2 py-1 text-sm font-semibold text-white">
                  {row.missCount}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </main>
  );
}
