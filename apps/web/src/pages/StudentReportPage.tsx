import { useQuery } from "@tanstack/react-query";
import { Link, useParams, useSearchParams } from "react-router-dom";
import {
  DEFAULT_REPORT_DAYS,
  studentReportSchema,
  type StudentReportTask,
} from "@classroom-tracker/shared";
import { apiFetch } from "../api";

const DAY_OPTIONS = [7, 14, 30, 90] as const;

function statusLabel(status: StudentReportTask["status"]): string {
  return status.replaceAll("_", " ");
}

function taskDetail(task: StudentReportTask): string | null {
  if (task.type === "WEEKLY_TEST" && task.marks != null) {
    return `${task.marks}${task.maxMarks != null ? ` / ${task.maxMarks}` : ""}`;
  }
  if (task.type === "HOLIDAY_HOMEWORK" && task.partsDone != null) {
    return `${task.partsDone}${task.totalParts != null ? ` / ${task.totalParts} parts` : " parts"}`;
  }
  if (task.remark) return task.remark;
  return null;
}

export function StudentReportPage() {
  const { classId = "", studentId = "" } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const daysParam = Number(searchParams.get("days"));
  const days =
    Number.isInteger(daysParam) && daysParam >= 1 && daysParam <= 365
      ? daysParam
      : DEFAULT_REPORT_DAYS;

  const query = useQuery({
    queryKey: ["student-report", classId, studentId, days],
    enabled: Boolean(classId && studentId),
    queryFn: async () =>
      studentReportSchema.parse(
        await apiFetch<unknown>(
          `/classes/${classId}/students/${studentId}/report?days=${days}`,
        ),
      ),
  });

  const summary = query.data?.summary;

  return (
    <main className="mx-auto min-h-screen max-w-lg px-4 py-6">
      <header className="mb-4">
        <div className="flex items-center justify-between gap-2">
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
            Tick grid
          </Link>
        </div>
        <h1 className="mt-2 text-2xl font-semibold text-[var(--accent)]">
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

      <div className="mb-4 flex gap-2">
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

      {query.isPending && (
        <p className="text-[var(--muted)]">Loading report…</p>
      )}
      {query.isError && (
        <p className="text-red-700">Could not load report.</p>
      )}

      {summary && (
        <section className="mb-6 grid grid-cols-2 gap-2">
          <Stat label="Tasks" value={summary.totalTasks} />
          <Stat label="Done" value={summary.doneCount} />
          <Stat label="Not done" value={summary.notDoneCount} />
          <Stat label="Incomplete" value={summary.incompleteCount} />
          <Stat label="Absent" value={summary.absentCount} />
          <Stat label="Pending" value={summary.pendingCount} />
          <Stat label="Weekly tests" value={summary.weeklyTestCount} />
          <Stat
            label="Test avg"
            value={
              summary.weeklyTestAvgMarks != null
                ? String(summary.weeklyTestAvgMarks)
                : "—"
            }
          />
        </section>
      )}

      <ul className="space-y-2">
        {(query.data?.tasks ?? []).map((task) => {
          const detail = taskDetail(task);
          return (
            <li
              key={task.taskId}
              className="rounded-xl bg-[var(--surface)] px-4 py-3 shadow-sm"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium">{task.title}</p>
                  <p className="mt-0.5 text-sm text-[var(--muted)]">
                    {task.type.replaceAll("_", " ")} · {task.assignedOn}
                  </p>
                  {detail && (
                    <p className="mt-1 text-sm text-[var(--ink)]">{detail}</p>
                  )}
                </div>
                <span className="shrink-0 rounded-lg bg-[var(--ink)]/10 px-2 py-1 text-xs font-medium uppercase tracking-wide">
                  {statusLabel(task.status)}
                </span>
              </div>
            </li>
          );
        })}
      </ul>

      {query.data && query.data.tasks.length === 0 && (
        <p className="rounded-xl bg-[var(--surface)] px-4 py-6 text-[var(--muted)] shadow-sm">
          No tasks assigned to this student in this window.
        </p>
      )}
    </main>
  );
}

function Stat({
  label,
  value,
}: {
  label: string;
  value: number | string;
}) {
  return (
    <div className="rounded-xl bg-[var(--surface)] px-3 py-3 shadow-sm">
      <p className="text-xs text-[var(--muted)]">{label}</p>
      <p className="mt-0.5 text-xl font-semibold">{value}</p>
    </div>
  );
}
