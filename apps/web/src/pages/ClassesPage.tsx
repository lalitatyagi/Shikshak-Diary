import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { classSchema, type ClassDto } from "@classroom-tracker/shared";
import { z } from "zod";
import { apiFetch } from "../api";
import { useAuth } from "../auth";

const classesSchema = z.array(classSchema);

export function ClassesPage() {
  const { user, logout } = useAuth();
  const classesQuery = useQuery({
    queryKey: ["classes"],
    queryFn: async () =>
      classesSchema.parse(await apiFetch<unknown>("/classes")),
  });

  return (
    <main className="mx-auto min-h-screen max-w-lg px-4 py-6">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-[var(--accent)]">
            Your classes
          </h1>
          <p className="mt-1 text-sm text-[var(--muted)]">{user?.name}</p>
        </div>
        <button
          type="button"
          onClick={() => void logout()}
          className="min-h-11 rounded-lg px-3 text-sm text-[var(--muted)] underline"
        >
          Log out
        </button>
      </header>

      {classesQuery.isPending && (
        <p className="mt-8 text-[var(--muted)]">Loading classes…</p>
      )}
      {classesQuery.isError && (
        <p className="mt-8 text-red-700">Could not load classes.</p>
      )}

      <ul className="mt-6 space-y-3">
        {(classesQuery.data ?? []).map((classroom: ClassDto) => (
          <li
            key={classroom.id}
            className="rounded-xl bg-[var(--surface)] px-4 py-3 shadow-sm"
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-lg font-medium">{classroom.name}</p>
                <p className="text-sm text-[var(--muted)]">
                  {classroom.academicYear}
                  {classroom.studentCount != null
                    ? ` · ${classroom.studentCount} students`
                    : ""}
                </p>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Link
                to={`/classes/${classroom.id}/grid`}
                className="flex min-h-11 items-center justify-center rounded-lg bg-[var(--accent)] text-sm font-medium text-white"
              >
                Tick grid
              </Link>
              <Link
                to={`/classes/${classroom.id}/defaulters`}
                className="flex min-h-11 items-center justify-center rounded-lg border border-[var(--accent)] text-sm font-medium text-[var(--accent)]"
              >
                Defaulters
              </Link>
            </div>
          </li>
        ))}
      </ul>

      {classesQuery.data?.length === 0 && (
        <p className="mt-8 text-[var(--muted)]">
          No classes yet. Create one via the API, then refresh.
        </p>
      )}
    </main>
  );
}
