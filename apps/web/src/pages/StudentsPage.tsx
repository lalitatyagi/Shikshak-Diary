import { useQuery } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import {
  paginatedResponseSchema,
  studentSchema,
  type StudentDto,
} from "@classroom-tracker/shared";
import { apiFetch } from "../api";

const studentsPageSchema = paginatedResponseSchema(studentSchema);

export function StudentsPage() {
  const { classId = "" } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const [draftQ, setDraftQ] = useState(searchParams.get("q") ?? "");
  const q = searchParams.get("q") ?? "";
  const page = Math.max(1, Number(searchParams.get("page")) || 1);

  const query = useQuery({
    queryKey: ["students", classId, q, page],
    enabled: Boolean(classId),
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page) });
      if (q) params.set("q", q);
      return studentsPageSchema.parse(
        await apiFetch<unknown>(
          `/classes/${classId}/students?${params.toString()}`,
        ),
      );
    },
  });

  function applySearch(event: FormEvent) {
    event.preventDefault();
    const next = new URLSearchParams();
    const trimmed = draftQ.trim();
    if (trimmed) next.set("q", trimmed);
    next.set("page", "1");
    setSearchParams(next);
  }

  return (
    <main className="mx-auto min-h-screen max-w-lg px-4 py-6">
      <header className="mb-4">
        <div className="flex items-center justify-between gap-2">
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
          Students
        </h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Open a student for their activity report.
        </p>
      </header>

      <form onSubmit={applySearch} className="mb-4 flex gap-2">
        <input
          value={draftQ}
          onChange={(event) => setDraftQ(event.target.value)}
          placeholder="Search name or roll"
          className="min-h-11 flex-1 rounded-lg border border-[var(--ink)]/15 bg-[var(--surface)] px-3 text-sm"
        />
        <button
          type="submit"
          className="min-h-11 rounded-lg bg-[var(--accent)] px-4 text-sm font-medium text-white"
        >
          Search
        </button>
      </form>

      {query.isPending && (
        <p className="text-[var(--muted)]">Loading students…</p>
      )}
      {query.isError && (
        <p className="text-red-700">Could not load students.</p>
      )}

      {query.data && query.data.items.length === 0 && (
        <p className="rounded-xl bg-[var(--surface)] px-4 py-6 text-[var(--muted)] shadow-sm">
          No students match this search.
        </p>
      )}

      <ul className="space-y-2">
        {(query.data?.items ?? []).map((student: StudentDto) => (
          <li key={student.id}>
            <Link
              to={`/classes/${classId}/students/${student.id}/report`}
              className="flex min-h-12 items-center justify-between gap-3 rounded-xl bg-[var(--surface)] px-4 py-3 shadow-sm"
            >
              <span className="text-lg font-medium">
                <span className="text-[var(--muted)]">
                  #{student.rollNumber}
                </span>{" "}
                {student.name}
              </span>
              <span className="text-sm text-[var(--accent)]">Report →</span>
            </Link>
          </li>
        ))}
      </ul>

      {query.data && query.data.totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between gap-2">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => {
              const next = new URLSearchParams(searchParams);
              next.set("page", String(page - 1));
              setSearchParams(next);
            }}
            className="min-h-11 rounded-lg border border-[var(--accent)] px-4 text-sm font-medium text-[var(--accent)] disabled:opacity-40"
          >
            Previous
          </button>
          <p className="text-sm text-[var(--muted)]">
            Page {page} of {query.data.totalPages}
          </p>
          <button
            type="button"
            disabled={page >= query.data.totalPages}
            onClick={() => {
              const next = new URLSearchParams(searchParams);
              next.set("page", String(page + 1));
              setSearchParams(next);
            }}
            className="min-h-11 rounded-lg border border-[var(--accent)] px-4 text-sm font-medium text-[var(--accent)] disabled:opacity-40"
          >
            Next
          </button>
        </div>
      )}
    </main>
  );
}
