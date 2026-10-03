import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { useRef, useState, type FormEvent } from "react";
import {
  classGridSchema,
  createTaskBodySchema,
  longPressStatuses,
  primaryTapStatus,
  taskSchema,
  toKolkataCalendarDate,
  type ClassGridDto,
  type StatusValue,
  type TaskStatusDto,
  type TaskType,
} from "@classroom-tracker/shared";
import { apiFetch } from "../api";

function statusLabel(status: StatusValue): string {
  switch (status) {
    case "PENDING":
      return "—";
    case "DONE":
      return "Done";
    case "NOT_DONE":
      return "Not";
    case "INCOMPLETE":
      return "Inc";
    case "CHECKED":
      return "✓";
    case "NOT_CHECKED":
      return "✗";
    case "ABSENT":
      return "Abs";
    default:
      return status;
  }
}

function statusClass(status: StatusValue): string {
  switch (status) {
    case "DONE":
    case "CHECKED":
      return "bg-emerald-700 text-white";
    case "NOT_DONE":
    case "NOT_CHECKED":
      return "bg-red-700 text-white";
    case "INCOMPLETE":
      return "bg-amber-500 text-[var(--ink)]";
    case "ABSENT":
      return "bg-slate-500 text-white";
    default:
      return "bg-emerald-50 text-[var(--ink)] border border-emerald-900/10";
  }
}

function statusKey(taskId: string, studentId: string): string {
  return `${taskId}:${studentId}`;
}

function menuLabel(status: StatusValue): string {
  switch (status) {
    case "INCOMPLETE":
      return "Incomplete";
    case "ABSENT":
      return "Absent";
    case "PENDING":
      return "Clear (pending)";
    default:
      return status;
  }
}

export function TickGridPage() {
  const { classId = "" } = useParams();
  const queryClient = useQueryClient();
  const queryKey = ["grid", classId] as const;
  const queuesRef = useRef(new Map<string, Promise<void>>());
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressFired = useRef(false);

  const [showNewTask, setShowNewTask] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newType, setNewType] = useState<"DAILY_HOMEWORK" | "NOTEBOOK_CHECK">(
    "DAILY_HOMEWORK",
  );
  const [newDueOn, setNewDueOn] = useState(() =>
    toKolkataCalendarDate(new Date()),
  );
  const [menu, setMenu] = useState<{
    statusId: string;
    taskType: TaskType;
  } | null>(null);

  const gridQuery = useQuery({
    queryKey,
    enabled: Boolean(classId),
    queryFn: async () =>
      classGridSchema.parse(
        await apiFetch<unknown>(`/classes/${classId}/grid`),
      ),
  });

  function enqueueStatusUpdate(
    statusId: string,
    next: StatusValue,
  ): Promise<void> {
    const prior = queuesRef.current.get(statusId) ?? Promise.resolve();
    const job = prior
      .catch(() => undefined)
      .then(async () => {
        const currentGrid = queryClient.getQueryData<ClassGridDto>(queryKey);
        const cell = currentGrid?.statuses.find((row) => row.id === statusId);
        if (!cell) {
          return;
        }

        // Optimistic update with explicit target status
        queryClient.setQueryData<ClassGridDto>(queryKey, (old) => {
          if (!old) return old;
          return {
            ...old,
            statuses: old.statuses.map((row) =>
              row.id === statusId
                ? { ...row, status: next, version: row.version + 1 }
                : row,
            ),
          };
        });

        try {
          const updated = await apiFetch<TaskStatusDto>(
            `/task-statuses/${statusId}`,
            {
              method: "PUT",
              body: JSON.stringify({ status: next, version: cell.version }),
            },
          );
          queryClient.setQueryData<ClassGridDto>(queryKey, (old) => {
            if (!old) return old;
            return {
              ...old,
              statuses: old.statuses.map((row) =>
                row.id === statusId ? { ...row, ...updated } : row,
              ),
            };
          });
        } catch {
          await queryClient.invalidateQueries({ queryKey });
        }
      });

    queuesRef.current.set(statusId, job);
    return job;
  }

  const createTaskMutation = useMutation({
    mutationFn: async () => {
      const grid = queryClient.getQueryData<ClassGridDto>(queryKey);
      if (!grid) {
        throw new Error("Grid not loaded");
      }
      const body = createTaskBodySchema.parse({
        subjectId: grid.defaultSubjectId,
        type: newType,
        title: newTitle.trim(),
        assignedOn: newDueOn,
        dueOn: newDueOn,
      });
      return taskSchema.parse(
        await apiFetch(`/classes/${classId}/tasks`, {
          method: "POST",
          body: JSON.stringify(body),
        }),
      );
    },
    onSuccess: async () => {
      setShowNewTask(false);
      setNewTitle("");
      await queryClient.invalidateQueries({ queryKey });
    },
  });

  const bulkMutation = useMutation({
    mutationFn: async (taskId: string) =>
      apiFetch(`/tasks/${taskId}/mark-all-complete`, { method: "POST" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey });
    },
  });

  const grid = gridQuery.data;
  const byKey = new Map(
    (grid?.statuses ?? []).map((row) => [
      statusKey(row.taskId, row.studentId),
      row,
    ]),
  );

  function onCreateTask(event: FormEvent) {
    event.preventDefault();
    createTaskMutation.mutate();
  }

  return (
    <main className="mx-auto min-h-screen max-w-[100vw] px-2 py-4 sm:px-4">
      <header className="mb-3 flex items-center justify-between gap-2 px-1">
        <div className="min-w-0">
          <Link to="/" className="text-sm text-[var(--muted)] underline">
            ← Classes
          </Link>
          <h1 className="truncate text-xl font-semibold text-[var(--accent)]">
            {grid?.class.name ?? "Tick grid"}
          </h1>
        </div>
        <button
          type="button"
          onClick={() => setShowNewTask((open) => !open)}
          className="min-h-11 shrink-0 rounded-lg bg-[var(--accent)] px-3 text-sm font-medium text-white"
        >
          + New task
        </button>
      </header>

      {showNewTask && (
        <form
          onSubmit={onCreateTask}
          className="mb-4 space-y-3 rounded-xl bg-[var(--surface)] p-4 shadow-sm"
        >
          <label className="block text-sm">
            <span className="text-[var(--muted)]">Title</span>
            <input
              className="mt-1 w-full rounded-lg border border-emerald-900/15 px-3 py-3"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="Exercise 1.2"
              required
            />
          </label>
          <label className="block text-sm">
            <span className="text-[var(--muted)]">Type</span>
            <select
              className="mt-1 w-full rounded-lg border border-emerald-900/15 px-3 py-3"
              value={newType}
              onChange={(e) =>
                setNewType(
                  e.target.value as "DAILY_HOMEWORK" | "NOTEBOOK_CHECK",
                )
              }
            >
              <option value="DAILY_HOMEWORK">Homework</option>
              <option value="NOTEBOOK_CHECK">Notebook check</option>
            </select>
          </label>
          <label className="block text-sm">
            <span className="text-[var(--muted)]">Due date</span>
            <input
              type="date"
              className="mt-1 w-full rounded-lg border border-emerald-900/15 px-3 py-3"
              value={newDueOn}
              onChange={(e) => setNewDueOn(e.target.value)}
              required
            />
          </label>
          {createTaskMutation.isError && (
            <p className="text-sm text-red-700">Could not create task.</p>
          )}
          <button
            type="submit"
            disabled={createTaskMutation.isPending || !newTitle.trim()}
            className="min-h-12 w-full rounded-lg bg-[var(--accent)] text-white disabled:opacity-60"
          >
            {createTaskMutation.isPending ? "Creating…" : "Create task"}
          </button>
        </form>
      )}

      {gridQuery.isPending && (
        <p className="px-1 text-[var(--muted)]">Loading grid…</p>
      )}
      {gridQuery.isError && (
        <p className="px-1 text-red-700">Could not load the grid.</p>
      )}

      {grid && grid.tasks.length === 0 && (
        <p className="px-1 text-[var(--muted)]">
          No tasks yet. Tap “+ New task” to add homework or a notebook check.
        </p>
      )}

      {grid && grid.tasks.length > 0 && (
        <>
          <div className="mb-3 flex gap-2 overflow-x-auto px-1 pb-1">
            {grid.tasks.map((task) => (
              <button
                key={task.id}
                type="button"
                disabled={bulkMutation.isPending}
                onClick={() => bulkMutation.mutate(task.id)}
                className="min-h-11 shrink-0 rounded-lg bg-[var(--accent)] px-3 text-sm font-medium whitespace-nowrap text-white"
              >
                Mark all · {task.title}
              </button>
            ))}
          </div>

          <div className="overflow-x-auto rounded-xl bg-[var(--surface)] shadow-sm">
            <table className="w-max min-w-full border-collapse text-sm">
              <thead>
                <tr>
                  <th className="sticky left-0 z-10 bg-[var(--surface)] px-2 py-3 text-left font-medium">
                    Student
                  </th>
                  {grid.tasks.map((task) => (
                    <th
                      key={task.id}
                      className="max-w-[5.5rem] px-1 py-3 text-center text-xs font-medium break-words"
                    >
                      {task.title}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {grid.students.map((student) => (
                  <tr
                    key={student.id}
                    className="border-t border-emerald-900/10"
                  >
                    <th className="sticky left-0 z-10 bg-[var(--surface)] px-2 py-2 text-left font-normal">
                      <span className="block text-xs text-[var(--muted)]">
                        {student.rollNumber}
                      </span>
                      <span className="block max-w-[7rem] truncate text-sm">
                        {student.name}
                      </span>
                    </th>
                    {grid.tasks.map((task) => {
                      const cell = byKey.get(statusKey(task.id, student.id));
                      return (
                        <td key={task.id} className="px-1 py-1 text-center">
                          <button
                            type="button"
                            disabled={!cell}
                            aria-label={`${student.name} ${task.title}`}
                            onPointerDown={() => {
                              longPressFired.current = false;
                              if (longPressTimer.current) {
                                clearTimeout(longPressTimer.current);
                              }
                              longPressTimer.current = setTimeout(() => {
                                longPressFired.current = true;
                                if (cell) {
                                  setMenu({
                                    statusId: cell.id,
                                    taskType: task.type,
                                  });
                                }
                              }, 450);
                            }}
                            onPointerUp={() => {
                              if (longPressTimer.current) {
                                clearTimeout(longPressTimer.current);
                              }
                            }}
                            onPointerLeave={() => {
                              if (longPressTimer.current) {
                                clearTimeout(longPressTimer.current);
                              }
                            }}
                            onClick={() => {
                              if (!cell || longPressFired.current) {
                                longPressFired.current = false;
                                return;
                              }
                              const next = primaryTapStatus(
                                task.type,
                                cell.status,
                              );
                              void enqueueStatusUpdate(cell.id, next);
                            }}
                            className={`min-h-12 min-w-12 rounded-lg px-1 text-xs font-semibold select-none ${
                              cell
                                ? statusClass(cell.status)
                                : "bg-slate-100 text-slate-400"
                            }`}
                          >
                            {cell ? statusLabel(cell.status) : "?"}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 px-1 text-xs text-[var(--muted)]">
            Tap: done ↔ not done. Long-press: incomplete / absent.
          </p>
        </>
      )}

      {menu && (
        <div
          className="fixed inset-0 z-20 flex items-end bg-black/40 p-4 sm:items-center sm:justify-center"
          role="presentation"
          onClick={() => setMenu(null)}
        >
          <div
            className="w-full max-w-sm rounded-xl bg-[var(--surface)] p-4 shadow-lg"
            role="dialog"
            aria-label="More status options"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="mb-3 text-sm font-medium">Set status</p>
            <div className="space-y-2">
              {longPressStatuses(menu.taskType).map((status) => (
                <button
                  key={status}
                  type="button"
                  className="min-h-12 w-full rounded-lg border border-emerald-900/10 px-3 text-left"
                  onClick={() => {
                    void enqueueStatusUpdate(menu.statusId, status);
                    setMenu(null);
                  }}
                >
                  {menuLabel(status)}
                </button>
              ))}
            </div>
            <button
              type="button"
              className="mt-3 min-h-11 w-full text-sm text-[var(--muted)] underline"
              onClick={() => setMenu(null)}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
