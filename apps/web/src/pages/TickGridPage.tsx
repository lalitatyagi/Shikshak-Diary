import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  addKolkataCalendarDays,
  ALL_WEEK_DAYS,
  classGridSchema,
  createRecurringTasksResultSchema,
  createTaskBodySchema,
  DAILY_HOMEWORK_TITLE_TEMPLATES,
  expandRecurringDates,
  longPressStatuses,
  primaryTapStatus,
  suggestDailyHomeworkTitle,
  taskSchema,
  taskTypeSchema,
  todayHomeworkResultSchema,
  toKolkataCalendarDate,
  WEEKDAY_SCHOOL_DAYS,
  type ClassGridDto,
  type StatusValue,
  type TaskStatusDto,
  type TaskType,
} from "@classroom-tracker/shared";

type RepeatPattern = "once" | "weekdays" | "daily";
import { ApiError, apiFetch } from "../api";
import { notifyOutboxChanged } from "../components/OfflineBanner";
import { readLastVisited, writeLastVisited } from "../lastVisited";
import {
  cacheClassGrid,
  enqueueStatusOutbox,
  isLikelyOfflineError,
  readCachedClassGrid,
} from "../offline";

const TYPE_FILTERS: Array<{ value: "" | TaskType; label: string }> = [
  { value: "", label: "All" },
  { value: "DAILY_HOMEWORK", label: "HW" },
  { value: "NOTEBOOK_CHECK", label: "NB" },
  { value: "WEEKLY_TEST", label: "Test" },
  { value: "HOLIDAY_HOMEWORK", label: "Holiday" },
  { value: "ATTENDANCE", label: "Att" },
];

const DAY_FILTERS = [7, 14, 30] as const;

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

function cellLabel(
  task: ClassGridDto["tasks"][number],
  cell: TaskStatusDto,
): string {
  if (task.type === "ATTENDANCE") {
    switch (cell.status) {
      case "DONE":
        return "P";
      case "ABSENT":
        return "A";
      case "INCOMPLETE":
        return "L";
      default:
        return "—";
    }
  }
  if (task.type === "WEEKLY_TEST") {
    if (cell.marks != null) {
      return `${cell.marks}/${task.maxMarks ?? "?"}`;
    }
    return statusLabel(cell.status);
  }
  if (task.type === "HOLIDAY_HOMEWORK") {
    const parts = cell.partsDone ?? 0;
    return `${parts}/${task.totalParts ?? "?"}`;
  }
  return statusLabel(cell.status);
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

function menuLabel(status: StatusValue, taskType: TaskType): string {
  if (taskType === "ATTENDANCE" && status === "INCOMPLETE") {
    return "Late";
  }
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
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const queuesRef = useRef(new Map<string, Promise<void>>());
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressFired = useRef(false);

  const typeParam = searchParams.get("type") ?? "";
  const typeFilter = taskTypeSchema.safeParse(typeParam).success
    ? (typeParam as TaskType)
    : undefined;
  const daysParam = Number(searchParams.get("days"));
  const daysFilter =
    Number.isInteger(daysParam) && daysParam >= 1 && daysParam <= 365
      ? daysParam
      : undefined;
  const qFilter = (searchParams.get("q") ?? "").trim();
  const [draftQ, setDraftQ] = useState(qFilter);

  const queryKey = ["grid", classId, typeFilter, daysFilter, qFilter] as const;

  const [showNewTask, setShowNewTask] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newType, setNewType] = useState<TaskType>("DAILY_HOMEWORK");
  const [newMaxMarks, setNewMaxMarks] = useState("20");
  const [newTotalParts, setNewTotalParts] = useState("5");
  const [newDueOn, setNewDueOn] = useState(() =>
    toKolkataCalendarDate(new Date()),
  );
  const [repeatPattern, setRepeatPattern] = useState<RepeatPattern>("once");
  const [repeatNote, setRepeatNote] = useState<string | null>(null);
  const [menu, setMenu] = useState<{
    statusId: string;
    taskType: TaskType;
  } | null>(null);
  const [marksEditor, setMarksEditor] = useState<{
    statusId: string;
    studentName: string;
    taskTitle: string;
    maxMarks: number;
    currentMarks: number | null;
  } | null>(null);
  const [marksDraft, setMarksDraft] = useState("");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [undoSnapshot, setUndoSnapshot] = useState<{
    statusId: string;
    status: StatusValue;
    marks: number | null;
    partsDone: number | null;
  } | null>(null);

  const gridQuery = useQuery({
    queryKey,
    enabled: Boolean(classId),
    queryFn: async () => {
      const params = new URLSearchParams();
      if (typeFilter) params.set("type", typeFilter);
      if (daysFilter != null) params.set("days", String(daysFilter));
      if (qFilter) params.set("q", qFilter);
      const qs = params.toString();
      try {
        const grid = classGridSchema.parse(
          await apiFetch<unknown>(
            `/classes/${classId}/grid${qs ? `?${qs}` : ""}`,
          ),
        );
        cacheClassGrid(classId, grid);
        return grid;
      } catch (error) {
        const cached = readCachedClassGrid(classId);
        if (cached && isLikelyOfflineError(error)) {
          return cached;
        }
        throw error;
      }
    },
  });

  const restoredFiltersRef = useRef(false);
  useEffect(() => {
    if (!classId || restoredFiltersRef.current) return;
    restoredFiltersRef.current = true;
    if (searchParams.has("type") || searchParams.has("days")) return;
    const last = readLastVisited();
    if (!last || last.classId !== classId || last.path !== "grid") return;
    const next = new URLSearchParams(searchParams);
    let changed = false;
    if (last.type) {
      next.set("type", last.type);
      changed = true;
    }
    if (last.days != null) {
      next.set("days", String(last.days));
      changed = true;
    }
    if (changed) setSearchParams(next, { replace: true });
  }, [classId, searchParams, setSearchParams]);

  useEffect(() => {
    if (!classId) return;
    writeLastVisited({
      classId,
      className: gridQuery.data?.class.name,
      path: "grid",
      type: typeFilter,
      days: daysFilter,
    });
  }, [classId, typeFilter, daysFilter, gridQuery.data?.class.name]);

  function patchFilters(patch: Record<string, string | undefined>) {
    const next = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(patch)) {
      if (value == null || value === "") next.delete(key);
      else next.set(key, value);
    }
    setSearchParams(next);
  }

  function enqueueStatusUpdate(
    statusId: string,
    next: StatusValue,
    extras?: { marks?: number | null; partsDone?: number | null },
    options?: { skipUndoCapture?: boolean },
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

        if (!options?.skipUndoCapture) {
          setUndoSnapshot({
            statusId,
            status: cell.status,
            marks: cell.marks ?? null,
            partsDone: cell.partsDone ?? null,
          });
        }

        // Optimistic update with explicit target status
        queryClient.setQueryData<ClassGridDto>(queryKey, (old) => {
          if (!old) return old;
          return {
            ...old,
            statuses: old.statuses.map((row) =>
              row.id === statusId
                ? {
                    ...row,
                    status: next,
                    version: row.version + 1,
                    marks:
                      extras && "marks" in extras ? extras.marks : row.marks,
                    partsDone:
                      extras && "partsDone" in extras
                        ? extras.partsDone
                        : row.partsDone,
                  }
                : row,
            ),
          };
        });

        try {
          const updated = await apiFetch<TaskStatusDto>(
            `/task-statuses/${statusId}`,
            {
              method: "PUT",
              body: JSON.stringify({
                status: next,
                version: cell.version,
                ...extras,
              }),
            },
          );
          queryClient.setQueryData<ClassGridDto>(queryKey, (old) => {
            if (!old) return old;
            const nextGrid = {
              ...old,
              statuses: old.statuses.map((row) =>
                row.id === statusId ? { ...row, ...updated } : row,
              ),
            };
            cacheClassGrid(classId, nextGrid);
            return nextGrid;
          });
        } catch (error) {
          if (isLikelyOfflineError(error)) {
            enqueueStatusOutbox({
              classId,
              statusId,
              status: next,
              version: cell.version,
              marks: extras?.marks,
              partsDone: extras?.partsDone,
            });
            notifyOutboxChanged();
            setSaveError("Offline — mark queued and will sync later.");
            const queued = queryClient.getQueryData<ClassGridDto>(queryKey);
            if (queued) cacheClassGrid(classId, queued);
            return;
          }
          setSaveError(
            error instanceof ApiError
              ? error.message
              : "Could not save that mark.",
          );
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
        maxMarks: newType === "WEEKLY_TEST" ? Number(newMaxMarks) : undefined,
        totalParts:
          newType === "HOLIDAY_HOMEWORK" ? Number(newTotalParts) : undefined,
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
      setRepeatPattern("once");
      setRepeatNote(null);
      await queryClient.invalidateQueries({ queryKey });
      void queryClient.invalidateQueries({ queryKey: ["home"] });
    },
  });

  const createRecurringMutation = useMutation({
    mutationFn: async () => {
      const grid = queryClient.getQueryData<ClassGridDto>(queryKey);
      if (!grid) {
        throw new Error("Grid not loaded");
      }
      const toDate = addKolkataCalendarDays(newDueOn, 6);
      const weekdays =
        repeatPattern === "daily"
          ? [...ALL_WEEK_DAYS]
          : [...WEEKDAY_SCHOOL_DAYS];
      return createRecurringTasksResultSchema.parse(
        await apiFetch(`/classes/${classId}/tasks/recurring`, {
          method: "POST",
          body: JSON.stringify({
            subjectId: grid.defaultSubjectId,
            type: newType,
            title: newTitle.trim(),
            fromDate: newDueOn,
            toDate,
            weekdays,
            maxMarks:
              newType === "WEEKLY_TEST" ? Number(newMaxMarks) : undefined,
            totalParts:
              newType === "HOLIDAY_HOMEWORK"
                ? Number(newTotalParts)
                : undefined,
          }),
        }),
      );
    },
    onSuccess: async (result) => {
      setShowNewTask(false);
      setNewTitle("");
      setRepeatPattern("once");
      setRepeatNote(
        `Created ${result.created.length}` +
          (result.skippedDates.length > 0
            ? ` · skipped ${result.skippedDates.length} existing`
            : ""),
      );
      await queryClient.invalidateQueries({ queryKey });
      void queryClient.invalidateQueries({ queryKey: ["home"] });
    },
  });

  const takeAttendanceMutation = useMutation({
    mutationFn: async () => {
      const grid = queryClient.getQueryData<ClassGridDto>(queryKey);
      if (!grid) {
        throw new Error("Grid not loaded");
      }
      const today = toKolkataCalendarDate(new Date());
      const existing = grid.tasks.find(
        (task) => task.type === "ATTENDANCE" && task.assignedOn === today,
      );
      if (existing) {
        return existing;
      }
      const body = createTaskBodySchema.parse({
        subjectId: grid.defaultSubjectId,
        type: "ATTENDANCE",
        title: `Attendance ${today}`,
        assignedOn: today,
        dueOn: today,
      });
      return taskSchema.parse(
        await apiFetch(`/classes/${classId}/tasks`, {
          method: "POST",
          body: JSON.stringify(body),
        }),
      );
    },
    onSuccess: async () => {
      patchFilters({ type: "ATTENDANCE" });
      await queryClient.invalidateQueries({
        queryKey: ["grid", classId],
      });
      void queryClient.invalidateQueries({ queryKey: ["home"] });
    },
  });

  const todayHomeworkMutation = useMutation({
    mutationFn: async (title?: string) => {
      const grid = queryClient.getQueryData<ClassGridDto>(queryKey);
      return todayHomeworkResultSchema.parse(
        await apiFetch(`/classes/${classId}/tasks/today-homework`, {
          method: "POST",
          body: JSON.stringify({
            ...(title ? { title } : {}),
            ...(grid?.defaultSubjectId
              ? { subjectId: grid.defaultSubjectId }
              : {}),
          }),
        }),
      );
    },
    onSuccess: async () => {
      patchFilters({ type: "DAILY_HOMEWORK" });
      await queryClient.invalidateQueries({
        queryKey: ["grid", classId],
      });
      void queryClient.invalidateQueries({ queryKey: ["home"] });
    },
  });

  function openNewTaskForm() {
    const today = toKolkataCalendarDate(new Date());
    const suggested = suggestDailyHomeworkTitle(grid?.tasks ?? [], today);
    setNewType("DAILY_HOMEWORK");
    setNewTitle(suggested);
    setNewDueOn(today);
    setRepeatPattern("once");
    setShowNewTask((open) => !open);
  }

  const bulkMutation = useMutation({
    mutationFn: async (taskId: string) =>
      apiFetch(`/tasks/${taskId}/mark-all-complete`, { method: "POST" }),
    onSuccess: () => {
      setSaveError(null);
      void queryClient.invalidateQueries({ queryKey });
    },
    onError: (error) => {
      setSaveError(
        error instanceof ApiError
          ? error.message
          : "Could not mark the class complete.",
      );
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
    if (repeatPattern === "once") {
      createTaskMutation.mutate();
      return;
    }
    createRecurringMutation.mutate();
  }

  const recurringPreviewCount =
    repeatPattern === "once"
      ? 1
      : expandRecurringDates(
          newDueOn,
          addKolkataCalendarDays(newDueOn, 6),
          repeatPattern === "daily"
            ? [...ALL_WEEK_DAYS]
            : [...WEEKDAY_SCHOOL_DAYS],
        ).length;

  const createPending =
    createTaskMutation.isPending || createRecurringMutation.isPending;

  function undoLastMark() {
    if (!undoSnapshot) return;
    const snap = undoSnapshot;
    setUndoSnapshot(null);
    void enqueueStatusUpdate(
      snap.statusId,
      snap.status,
      { marks: snap.marks, partsDone: snap.partsDone },
      { skipUndoCapture: true },
    );
  }

  return (
    <main className="mx-auto min-h-screen max-w-[100vw] px-2 py-4 sm:px-4">
      <header className="mb-3 flex items-center justify-between gap-2 px-1">
        <div className="min-w-0">
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm">
            <Link to="/" className="text-[var(--muted)] underline">
              ← Classes
            </Link>
            <Link
              to={`/classes/${classId}/defaulters`}
              className="text-[var(--accent)] underline"
            >
              Defaulters
            </Link>
          </div>
          <h1 className="truncate text-xl font-semibold text-[var(--accent)]">
            {grid?.class.name ?? "Tick grid"}
          </h1>
        </div>
        <div className="flex shrink-0 flex-wrap justify-end gap-2">
          <button
            type="button"
            disabled={!undoSnapshot}
            onClick={undoLastMark}
            className="min-h-11 rounded-lg border border-[var(--accent)] px-3 text-sm font-medium text-[var(--accent)] disabled:opacity-40"
          >
            Undo
          </button>
          <button
            type="button"
            disabled={takeAttendanceMutation.isPending || !grid}
            onClick={() => takeAttendanceMutation.mutate()}
            className="min-h-11 rounded-lg border border-[var(--accent)] px-3 text-sm font-medium text-[var(--accent)] disabled:opacity-40"
          >
            Attendance
          </button>
          <button
            type="button"
            disabled={todayHomeworkMutation.isPending || !grid}
            onClick={() => todayHomeworkMutation.mutate(undefined)}
            className="min-h-11 rounded-lg border border-[var(--accent)] px-3 text-sm font-medium text-[var(--accent)] disabled:opacity-40"
          >
            {todayHomeworkMutation.isPending ? "HW…" : "Today's HW"}
          </button>
          <button
            type="button"
            onClick={openNewTaskForm}
            className="min-h-11 rounded-lg bg-[var(--accent)] px-3 text-sm font-medium text-white"
          >
            + New task
          </button>
        </div>
      </header>

      <div className="mb-3 space-y-2 px-1">
        <div className="flex gap-1 overflow-x-auto">
          {TYPE_FILTERS.map((option) => (
            <button
              key={option.label}
              type="button"
              onClick={() => patchFilters({ type: option.value || undefined })}
              className={`min-h-10 shrink-0 rounded-lg px-3 text-sm font-medium ${
                (typeFilter ?? "") === option.value
                  ? "bg-[var(--accent)] text-white"
                  : "bg-[var(--surface)] text-[var(--ink)] shadow-sm"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => patchFilters({ days: undefined })}
            className={`min-h-10 flex-1 rounded-lg text-sm font-medium ${
              daysFilter == null
                ? "bg-[var(--accent)] text-white"
                : "bg-[var(--surface)] text-[var(--ink)] shadow-sm"
            }`}
          >
            All days
          </button>
          {DAY_FILTERS.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => patchFilters({ days: String(option) })}
              className={`min-h-10 flex-1 rounded-lg text-sm font-medium ${
                daysFilter === option
                  ? "bg-[var(--accent)] text-white"
                  : "bg-[var(--surface)] text-[var(--ink)] shadow-sm"
              }`}
            >
              {option}d
            </button>
          ))}
        </div>
        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            patchFilters({ q: draftQ.trim() || undefined });
          }}
        >
          <input
            value={draftQ}
            onChange={(event) => setDraftQ(event.target.value)}
            placeholder="Find student"
            className="min-h-11 flex-1 rounded-lg border border-emerald-900/15 bg-[var(--surface)] px-3 text-sm"
          />
          <button
            type="submit"
            className="min-h-11 rounded-lg border border-[var(--accent)] px-3 text-sm font-medium text-[var(--accent)]"
          >
            Find
          </button>
        </form>
      </div>

      {showNewTask && (
        <form
          onSubmit={onCreateTask}
          className="mb-4 space-y-3 rounded-xl bg-[var(--surface)] p-4 shadow-sm"
        >
          <div>
            <p className="text-sm text-[var(--muted)]">Quick titles</p>
            <div className="mt-1 flex flex-wrap gap-2">
              {DAILY_HOMEWORK_TITLE_TEMPLATES.map((template) => (
                <button
                  key={template}
                  type="button"
                  onClick={() => {
                    setNewType("DAILY_HOMEWORK");
                    setNewTitle(template);
                  }}
                  className={`min-h-10 rounded-lg px-3 text-sm font-medium ${
                    newType === "DAILY_HOMEWORK" && newTitle === template
                      ? "bg-[var(--accent)] text-white"
                      : "border border-[var(--accent)] text-[var(--accent)]"
                  }`}
                >
                  {template}
                </button>
              ))}
              <button
                type="button"
                disabled={todayHomeworkMutation.isPending}
                onClick={() => {
                  todayHomeworkMutation.mutate(
                    newTitle.trim() || undefined,
                  );
                  setShowNewTask(false);
                }}
                className="min-h-10 rounded-lg bg-emerald-800 px-3 text-sm font-medium text-white disabled:opacity-60"
              >
                Create today’s HW
              </button>
            </div>
          </div>
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
              onChange={(e) => setNewType(e.target.value as TaskType)}
            >
              <option value="DAILY_HOMEWORK">Homework</option>
              <option value="NOTEBOOK_CHECK">Notebook check</option>
              <option value="WEEKLY_TEST">Weekly test</option>
              <option value="HOLIDAY_HOMEWORK">Holiday homework</option>
              <option value="ATTENDANCE">Attendance</option>
            </select>
          </label>
          {newType === "WEEKLY_TEST" && (
            <label className="block text-sm">
              <span className="text-[var(--muted)]">Max marks</span>
              <input
                type="number"
                min={1}
                max={1000}
                required
                className="mt-1 w-full rounded-lg border border-emerald-900/15 px-3 py-3"
                value={newMaxMarks}
                onChange={(e) => setNewMaxMarks(e.target.value)}
              />
            </label>
          )}
          {newType === "HOLIDAY_HOMEWORK" && (
            <label className="block text-sm">
              <span className="text-[var(--muted)]">Total parts</span>
              <input
                type="number"
                min={1}
                max={100}
                required
                className="mt-1 w-full rounded-lg border border-emerald-900/15 px-3 py-3"
                value={newTotalParts}
                onChange={(e) => setNewTotalParts(e.target.value)}
              />
            </label>
          )}
          <label className="block text-sm">
            <span className="text-[var(--muted)]">
              {repeatPattern === "once" ? "Due date" : "Start date"}
            </span>
            <input
              type="date"
              className="mt-1 w-full rounded-lg border border-emerald-900/15 px-3 py-3"
              value={newDueOn}
              onChange={(e) => setNewDueOn(e.target.value)}
              required
            />
          </label>
          <fieldset>
            <legend className="text-sm text-[var(--muted)]">Repeat</legend>
            <div className="mt-1 grid grid-cols-3 gap-2">
              {(
                [
                  { value: "once", label: "Once" },
                  { value: "weekdays", label: "Mon–Fri" },
                  { value: "daily", label: "Every day" },
                ] as const
              ).map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setRepeatPattern(option.value)}
                  className={`min-h-11 rounded-lg text-sm font-medium ${
                    repeatPattern === option.value
                      ? "bg-[var(--accent)] text-white"
                      : "border border-[var(--accent)] text-[var(--accent)]"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
            {repeatPattern !== "once" && (
              <p className="mt-2 text-sm text-[var(--muted)]">
                Creates {recurringPreviewCount} task
                {recurringPreviewCount === 1 ? "" : "s"} from {newDueOn} (next 7
                calendar days, matching days only).
              </p>
            )}
          </fieldset>
          {(createTaskMutation.isError || createRecurringMutation.isError) && (
            <p className="text-sm text-red-700">
              {(createTaskMutation.error instanceof ApiError
                ? createTaskMutation.error.message
                : null) ||
                (createRecurringMutation.error instanceof ApiError
                  ? createRecurringMutation.error.message
                  : null) ||
                "Could not create task."}
            </p>
          )}
          <button
            type="submit"
            disabled={createPending || !newTitle.trim()}
            className="min-h-12 w-full rounded-lg bg-[var(--accent)] text-white disabled:opacity-60"
          >
            {createPending
              ? "Creating…"
              : repeatPattern === "once"
                ? "Create task"
                : `Create ${recurringPreviewCount} tasks`}
          </button>
        </form>
      )}

      {repeatNote && (
        <p className="mb-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-[var(--ink)]">
          {repeatNote}
        </p>
      )}

      {saveError && (
        <p
          role="alert"
          className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800"
        >
          {saveError}
        </p>
      )}

      {gridQuery.isPending && (
        <p className="px-1 text-[var(--muted)]">Loading grid…</p>
      )}
      {gridQuery.isError && (
        <p className="px-1 text-red-700">Could not load the grid.</p>
      )}

      {todayHomeworkMutation.isError && (
        <p
          role="alert"
          className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800"
        >
          {todayHomeworkMutation.error instanceof ApiError
            ? todayHomeworkMutation.error.message
            : "Could not create today's homework."}
        </p>
      )}

      {grid && grid.tasks.length === 0 && (
        <p className="px-1 text-[var(--muted)]">
          No tasks yet. Tap “Today&apos;s HW” for one-tap homework, or “+ New
          task” for a test or check.
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
                      <span className="block">{task.title}</span>
                      {task.type === "WEEKLY_TEST" && task.maxMarks != null && (
                        <span className="mt-0.5 block font-normal text-[var(--muted)]">
                          /{task.maxMarks}
                        </span>
                      )}
                      {task.type === "HOLIDAY_HOMEWORK" &&
                        task.totalParts != null && (
                          <span className="mt-0.5 block font-normal text-[var(--muted)]">
                            {task.totalParts} parts
                          </span>
                        )}
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
                              if (task.type === "WEEKLY_TEST") {
                                setMarksEditor({
                                  statusId: cell.id,
                                  studentName: student.name,
                                  taskTitle: task.title,
                                  maxMarks: task.maxMarks ?? 0,
                                  currentMarks: cell.marks ?? null,
                                });
                                setMarksDraft(
                                  cell.marks != null ? String(cell.marks) : "",
                                );
                                setSaveError(null);
                                return;
                              }
                              if (task.type === "HOLIDAY_HOMEWORK") {
                                const total = task.totalParts ?? 1;
                                const current = cell.partsDone ?? 0;
                                const partsDone =
                                  current >= total ? 0 : current + 1;
                                const nextStatus: StatusValue =
                                  partsDone === 0
                                    ? "PENDING"
                                    : partsDone === total
                                      ? "DONE"
                                      : "INCOMPLETE";
                                void enqueueStatusUpdate(cell.id, nextStatus, {
                                  partsDone,
                                });
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
                            {cell ? cellLabel(task, cell) : "?"}
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
            Tap: HW done ↔ not; attendance P ↔ A; test opens marks; holiday
            advances parts. Long-press: incomplete / late / absent / clear.
          </p>
        </>
      )}

      {marksEditor && (
        <div
          className="fixed inset-0 z-20 flex items-end bg-black/40 p-4 sm:items-center sm:justify-center"
          role="presentation"
          onClick={() => setMarksEditor(null)}
        >
          <form
            className="w-full max-w-sm rounded-xl bg-[var(--surface)] p-4 shadow-lg"
            role="dialog"
            aria-label="Enter marks"
            onClick={(e) => e.stopPropagation()}
            onSubmit={(event) => {
              event.preventDefault();
              const raw = marksDraft.trim();
              if (raw.length === 0) {
                setSaveError("Enter marks, or use Clear.");
                return;
              }
              const marks = Number(raw);
              if (!Number.isInteger(marks)) {
                setSaveError("Enter a whole-number mark.");
                return;
              }
              if (marks < 0 || marks > marksEditor.maxMarks) {
                setSaveError(
                  `Marks must be between 0 and ${marksEditor.maxMarks}.`,
                );
                return;
              }
              setSaveError(null);
              void enqueueStatusUpdate(marksEditor.statusId, "DONE", {
                marks,
              });
              setMarksEditor(null);
            }}
          >
            <p className="text-sm font-medium text-[var(--ink)]">
              {marksEditor.studentName}
            </p>
            <p className="mt-0.5 text-sm text-[var(--muted)]">
              {marksEditor.taskTitle} · out of {marksEditor.maxMarks}
            </p>
            <label className="mt-4 block text-sm">
              <span className="text-[var(--muted)]">Marks</span>
              <input
                type="number"
                inputMode="numeric"
                min={0}
                max={marksEditor.maxMarks}
                step={1}
                autoFocus
                value={marksDraft}
                onChange={(e) => setMarksDraft(e.target.value)}
                placeholder={`0–${marksEditor.maxMarks}`}
                className="mt-1 w-full rounded-lg border border-emerald-900/15 px-3 py-3 text-lg"
              />
            </label>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                type="submit"
                className="min-h-12 rounded-lg bg-[var(--accent)] text-sm font-medium text-white"
              >
                Save marks
              </button>
              <button
                type="button"
                className="min-h-12 rounded-lg border border-[var(--accent)] text-sm font-medium text-[var(--accent)]"
                onClick={() => {
                  if (marksEditor.maxMarks > 0) {
                    setMarksDraft(String(marksEditor.maxMarks));
                  }
                }}
              >
                Full marks
              </button>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <button
                type="button"
                className="min-h-11 rounded-lg border border-emerald-900/10 text-sm"
                onClick={() => {
                  void enqueueStatusUpdate(marksEditor.statusId, "PENDING", {
                    marks: null,
                  });
                  setMarksEditor(null);
                }}
              >
                Clear
              </button>
              <button
                type="button"
                className="min-h-11 text-sm text-[var(--muted)] underline"
                onClick={() => setMarksEditor(null)}
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
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
                  {menuLabel(status, menu.taskType)}
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
