import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  classSchema,
  friendlyTaskType,
  homeResponseSchema,
  schoolSchema,
  type HomeClassCard,
  type SchoolDto,
} from "@classroom-tracker/shared";
import { z } from "zod";
import { ApiError, apiFetch } from "../api";
import { useAuth } from "../auth";

const schoolsSchema = z.array(schoolSchema);

export function ClassesPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [schoolId, setSchoolId] = useState("");
  const [name, setName] = useState("");
  const [academicYear, setAcademicYear] = useState("2025-26");
  const [subjectName, setSubjectName] = useState("General");
  const [formError, setFormError] = useState<string | null>(null);

  const homeQuery = useQuery({
    queryKey: ["home"],
    queryFn: async () =>
      homeResponseSchema.parse(await apiFetch<unknown>("/home")),
  });

  const schoolsQuery = useQuery({
    queryKey: ["schools"],
    queryFn: async () =>
      schoolsSchema.parse(await apiFetch<unknown>("/schools")),
  });

  const schools = schoolsQuery.data ?? [];
  const home = homeQuery.data;
  const classes = home?.classes ?? [];

  useEffect(() => {
    if (schools.length === 1 && !schoolId) {
      setSchoolId(schools[0]!.id);
    }
  }, [schools, schoolId]);

  const createClass = useMutation({
    mutationFn: async () => {
      const created = await apiFetch<unknown>("/classes", {
        method: "POST",
        body: JSON.stringify({
          schoolId,
          name: name.trim(),
          academicYear: academicYear.trim(),
          subjectName: subjectName.trim() || "General",
        }),
      });
      return classSchema.parse(created);
    },
    onSuccess: async (classroom) => {
      setName("");
      setFormError(null);
      setShowForm(false);
      await queryClient.invalidateQueries({ queryKey: ["home"] });
      await queryClient.invalidateQueries({ queryKey: ["classes"] });
      void navigate(`/classes/${classroom.id}/students?import=1`);
    },
    onError: (err) => {
      setFormError(
        err instanceof ApiError ? err.message : "Could not create class",
      );
    },
  });

  function onCreateSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    if (!schoolId) {
      setFormError("Pick a school first.");
      return;
    }
    createClass.mutate();
  }

  return (
    <main className="mx-auto min-h-screen max-w-lg px-4 py-6">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-[var(--accent)]">Today</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            {user?.name}
            {home?.today ? ` · ${home.today}` : ""}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void logout()}
          className="min-h-11 rounded-lg px-3 text-sm text-[var(--muted)] underline"
        >
          Log out
        </button>
      </header>

      {homeQuery.isPending && (
        <p className="mt-8 text-[var(--muted)]">Loading your classes…</p>
      )}
      {homeQuery.isError && (
        <p className="mt-8 text-red-700">Could not load home.</p>
      )}

      <ul className="mt-6 space-y-4">
        {classes.map((classroom: HomeClassCard) => (
          <li
            key={classroom.id}
            className="rounded-xl bg-[var(--surface)] px-4 py-4 shadow-sm"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-lg font-medium">{classroom.name}</p>
                <p className="text-sm text-[var(--muted)]">
                  {classroom.academicYear} · {classroom.studentCount} students
                </p>
              </div>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2">
              <div className="rounded-lg bg-[var(--ink)]/5 px-3 py-2">
                <p className="text-xs text-[var(--muted)]">Pending today</p>
                <p className="text-xl font-semibold text-[var(--ink)]">
                  {classroom.pendingTodayCount}
                </p>
              </div>
              <div className="rounded-lg bg-[var(--ink)]/5 px-3 py-2">
                <p className="text-xs text-[var(--muted)]">
                  Defaulters ({home?.defaultersDays ?? 7}d)
                </p>
                <p className="text-xl font-semibold text-[var(--ink)]">
                  {classroom.defaulterCount}
                </p>
              </div>
            </div>

            {classroom.todayTasks.length > 0 ? (
              <ul className="mt-3 space-y-1.5">
                {classroom.todayTasks.map((task) => (
                  <li
                    key={task.id}
                    className="flex items-center justify-between gap-2 text-sm"
                  >
                    <span className="min-w-0 truncate">
                      <span className="text-[var(--muted)]">
                        {friendlyTaskType(task.type)} ·{" "}
                      </span>
                      {task.title}
                    </span>
                    <span className="shrink-0 text-[var(--muted)]">
                      {task.pendingCount}/{task.total} left
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm text-[var(--muted)]">
                No tasks assigned today. Open the grid to add one.
              </p>
            )}

            <div className="mt-3 grid grid-cols-2 gap-2">
              <Link
                to={`/classes/${classroom.id}/grid`}
                className="col-span-2 flex min-h-11 items-center justify-center rounded-lg bg-[var(--accent)] text-sm font-medium text-white"
              >
                Tick grid
              </Link>
              <Link
                to={`/classes/${classroom.id}/grid?type=ATTENDANCE`}
                className="flex min-h-11 items-center justify-center rounded-lg border border-[var(--accent)] text-sm font-medium text-[var(--accent)]"
              >
                Attendance
              </Link>
              <Link
                to={`/classes/${classroom.id}/students`}
                className="flex min-h-11 items-center justify-center rounded-lg border border-[var(--accent)] text-sm font-medium text-[var(--accent)]"
              >
                Students
              </Link>
              <Link
                to={`/classes/${classroom.id}/defaulters`}
                className="col-span-2 flex min-h-11 items-center justify-center rounded-lg border border-[var(--accent)] text-sm font-medium text-[var(--accent)]"
              >
                Defaulters
                {classroom.defaulterCount > 0
                  ? ` (${classroom.defaulterCount})`
                  : ""}
              </Link>
            </div>
          </li>
        ))}
      </ul>

      {!homeQuery.isPending &&
        !schoolsQuery.isPending &&
        classes.length === 0 &&
        schools.length === 0 && (
          <div className="mt-8 space-y-3 rounded-xl bg-[var(--surface)] px-4 py-5 shadow-sm">
            <h2 className="text-lg font-medium text-[var(--accent)]">
              No school yet
            </h2>
            <p className="text-sm text-[var(--muted)]">
              Your account is ready, but you are not in a school. Ask your
              school admin to invite{" "}
              <span className="font-medium text-[var(--ink)]">
                {user?.email}
              </span>
              . After they invite you, refresh this page and create a class.
            </p>
            <p className="text-sm text-[var(--muted)]">
              Demo tip: sign in as{" "}
              <span className="font-medium text-[var(--ink)]">
                teacher@demo.local
              </span>{" "}
              (seeded class teacher) to explore a full class.
            </p>
          </div>
        )}

      {!homeQuery.isPending && classes.length === 0 && schools.length > 0 && (
        <p className="mt-8 text-[var(--muted)]">
          No classes yet. Create one below, then import your student roster.
        </p>
      )}

      {schoolsQuery.isSuccess && schools.length > 0 && (
        <div className="mt-8">
          {!showForm ? (
            <button
              type="button"
              onClick={() => setShowForm(true)}
              className="min-h-12 w-full rounded-lg border border-[var(--accent)] text-base font-medium text-[var(--accent)]"
            >
              + New class
            </button>
          ) : (
            <form
              onSubmit={onCreateSubmit}
              className="space-y-3 rounded-xl bg-[var(--surface)] p-5 shadow-sm"
            >
              <h2 className="text-lg font-medium text-[var(--accent)]">
                New class
              </h2>
              {schools.length > 1 ? (
                <label className="block text-sm">
                  <span className="text-[var(--muted)]">School</span>
                  <select
                    className="mt-1 w-full rounded-lg border border-emerald-900/15 px-3 py-3 text-base"
                    value={schoolId}
                    onChange={(e) => setSchoolId(e.target.value)}
                    required
                  >
                    <option value="">Select school</option>
                    {schools.map((school: SchoolDto) => (
                      <option key={school.id} value={school.id}>
                        {school.name}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <p className="text-sm text-[var(--muted)]">
                  School: {schools[0]?.name}
                </p>
              )}
              <label className="block text-sm">
                <span className="text-[var(--muted)]">Class name</span>
                <input
                  className="mt-1 w-full rounded-lg border border-emerald-900/15 px-3 py-3 text-base"
                  placeholder="e.g. 9-A"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  maxLength={50}
                />
              </label>
              <label className="block text-sm">
                <span className="text-[var(--muted)]">Academic year</span>
                <input
                  className="mt-1 w-full rounded-lg border border-emerald-900/15 px-3 py-3 text-base"
                  value={academicYear}
                  onChange={(e) => setAcademicYear(e.target.value)}
                  required
                  maxLength={20}
                />
              </label>
              <label className="block text-sm">
                <span className="text-[var(--muted)]">Subject</span>
                <input
                  className="mt-1 w-full rounded-lg border border-emerald-900/15 px-3 py-3 text-base"
                  value={subjectName}
                  onChange={(e) => setSubjectName(e.target.value)}
                  maxLength={100}
                />
              </label>
              {formError && <p className="text-sm text-red-700">{formError}</p>}
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={createClass.isPending}
                  className="min-h-12 flex-1 rounded-lg bg-[var(--accent)] text-base font-medium text-white disabled:opacity-60"
                >
                  {createClass.isPending ? "Creating…" : "Create class"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowForm(false);
                    setFormError(null);
                  }}
                  className="min-h-12 rounded-lg px-4 text-sm text-[var(--muted)] underline"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}
        </div>
      )}
    </main>
  );
}
