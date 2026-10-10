import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { studentSchema, type StudentDto } from "@classroom-tracker/shared";
import { z } from "zod";
import { apiFetch } from "../api";

const studentsSchema = z.array(studentSchema);

export function StudentsPage() {
  const { classId = "" } = useParams();

  const query = useQuery({
    queryKey: ["students", classId],
    enabled: Boolean(classId),
    queryFn: async () =>
      studentsSchema.parse(
        await apiFetch<unknown>(`/classes/${classId}/students`),
      ),
  });

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

      {query.isPending && (
        <p className="text-[var(--muted)]">Loading students…</p>
      )}
      {query.isError && (
        <p className="text-red-700">Could not load students.</p>
      )}

      {query.data && query.data.length === 0 && (
        <p className="rounded-xl bg-[var(--surface)] px-4 py-6 text-[var(--muted)] shadow-sm">
          No students enrolled yet.
        </p>
      )}

      <ul className="space-y-2">
        {(query.data ?? []).map((student: StudentDto) => (
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
    </main>
  );
}
