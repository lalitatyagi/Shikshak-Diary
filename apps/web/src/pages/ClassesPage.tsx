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
          <li key={classroom.id}>
            <Link
              to={`/classes/${classroom.id}/grid`}
              className="flex min-h-14 items-center justify-between rounded-xl bg-[var(--surface)] px-4 py-3 shadow-sm"
            >
              <span>
                <span className="block text-lg font-medium">
                  {classroom.name}
                </span>
                <span className="text-sm text-[var(--muted)]">
                  {classroom.academicYear}
                  {classroom.studentCount != null
                    ? ` · ${classroom.studentCount} students`
                    : ""}
                </span>
              </span>
              <span className="text-[var(--accent)]">Mark →</span>
            </Link>
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
