import type {
  StudentReport,
  StudentReportTask,
} from "@classroom-tracker/shared";

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

export function StudentReportView({ report }: { report: StudentReport }) {
  const { summary } = report;

  return (
    <>
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

      <ul className="space-y-2">
        {report.tasks.map((task) => {
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

      {report.tasks.length === 0 && (
        <p className="rounded-xl bg-[var(--surface)] px-4 py-6 text-[var(--muted)] shadow-sm">
          No tasks assigned to this student in this window.
        </p>
      )}
    </>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-xl bg-[var(--surface)] px-3 py-3 shadow-sm">
      <p className="text-xs text-[var(--muted)]">{label}</p>
      <p className="mt-0.5 text-xl font-semibold">{value}</p>
    </div>
  );
}
