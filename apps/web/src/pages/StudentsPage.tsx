import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import {
  canManageRoster,
  csvImportResultSchema,
  studentSchema,
  studentsListResponseSchema,
  toWhatsAppDigits,
  type CsvImportResult,
  type StudentDto,
} from "@classroom-tracker/shared";
import { ApiError, apiFetch } from "../api";
import { useAuth } from "../auth";
import { writeLastVisited } from "../lastVisited";

const SAMPLE_CSV =
  "rollNumber,name,parentContact\n1,Aarav Sharma,\n2,Ananya Verma,9800000002\n";

function displayPhone(contact: string | null): string {
  if (!contact) return "No phone";
  const digits = toWhatsAppDigits(contact);
  if (!digits) return contact;
  return `+${digits.slice(0, 2)} ${digits.slice(2)}`;
}

export function StudentsPage() {
  const { classId = "" } = useParams();
  const { user } = useAuth();
  const canImport = user ? canManageRoster(user.role) : false;
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [searchParams, setSearchParams] = useSearchParams();
  const [draftQ, setDraftQ] = useState(searchParams.get("q") ?? "");
  const q = searchParams.get("q") ?? "";
  const page = Math.max(1, Number(searchParams.get("page")) || 1);
  const missingOnly =
    searchParams.get("missingContact") === "1" ||
    searchParams.get("missingContact") === "true";

  const [showImport, setShowImport] = useState(
    () => searchParams.get("import") === "1",
  );
  const [csvText, setCsvText] = useState("");
  const [importError, setImportError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<CsvImportResult | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [phoneDraft, setPhoneDraft] = useState("");
  const [phoneError, setPhoneError] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ["students", classId, q, page, missingOnly],
    enabled: Boolean(classId),
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page) });
      if (q) params.set("q", q);
      if (missingOnly) params.set("missingContact", "1");
      return studentsListResponseSchema.parse(
        await apiFetch<unknown>(
          `/classes/${classId}/students?${params.toString()}`,
        ),
      );
    },
  });

  useEffect(() => {
    if (!classId) return;
    writeLastVisited({ classId, path: "students" });
  }, [classId]);

  const importMutation = useMutation({
    mutationFn: async (csv: string) =>
      csvImportResultSchema.parse(
        await apiFetch<unknown>(`/classes/${classId}/students/import`, {
          method: "POST",
          body: JSON.stringify({ csv }),
        }),
      ),
    onSuccess: async (result) => {
      setLastResult(result);
      setImportError(null);
      if (result.imported > 0) {
        setCsvText("");
        await queryClient.invalidateQueries({
          queryKey: ["students", classId],
        });
        await queryClient.invalidateQueries({ queryKey: ["classes"] });
      }
    },
    onError: (err) => {
      setLastResult(null);
      setImportError(
        err instanceof ApiError ? err.message : "Import failed. Try again.",
      );
    },
  });

  const updatePhoneMutation = useMutation({
    mutationFn: async (input: { studentId: string; parentContact: string }) =>
      studentSchema.parse(
        await apiFetch<unknown>(
          `/classes/${classId}/students/${input.studentId}`,
          {
            method: "PATCH",
            body: JSON.stringify({ parentContact: input.parentContact }),
          },
        ),
      ),
    onSuccess: async () => {
      setEditingId(null);
      setPhoneDraft("");
      setPhoneError(null);
      await queryClient.invalidateQueries({ queryKey: ["students", classId] });
      void queryClient.invalidateQueries({
        queryKey: ["defaulters", classId],
      });
    },
    onError: (err) => {
      setPhoneError(
        err instanceof ApiError ? err.message : "Could not save parent number.",
      );
    },
  });

  function applySearch(event: FormEvent) {
    event.preventDefault();
    const next = new URLSearchParams(searchParams);
    const trimmed = draftQ.trim();
    if (trimmed) next.set("q", trimmed);
    else next.delete("q");
    next.set("page", "1");
    setSearchParams(next);
  }

  function toggleMissingFilter() {
    const next = new URLSearchParams(searchParams);
    if (missingOnly) next.delete("missingContact");
    else next.set("missingContact", "1");
    next.set("page", "1");
    setSearchParams(next);
  }

  function startEdit(student: StudentDto) {
    setEditingId(student.id);
    setPhoneDraft(student.parentContact ?? "");
    setPhoneError(null);
  }

  function savePhone(studentId: string) {
    updatePhoneMutation.mutate({
      studentId,
      parentContact: phoneDraft.trim(),
    });
  }

  async function onFileChosen(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const text = await file.text();
      setCsvText(text);
      setImportError(null);
      setLastResult(null);
    } catch {
      setImportError("Could not read that file.");
    }
  }

  function onImportSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmed = csvText.trim();
    if (!trimmed) {
      setImportError("Paste CSV text or choose a .csv file first.");
      return;
    }
    importMutation.mutate(trimmed);
  }

  function downloadSample() {
    const blob = new Blob([SAMPLE_CSV], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "students-sample.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  const emptyList =
    query.data && query.data.items.length === 0 && !query.isPending;
  const missingCount = query.data?.missingParentContactCount ?? 0;

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
            Marking sheet
          </Link>
        </div>
        <h1 className="mt-2 text-2xl font-semibold text-[var(--accent)]">
          Students
        </h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Roster and parent phones for WhatsApp.
        </p>
      </header>

      {query.data && missingCount > 0 && (
        <div className="mb-4 rounded-xl border border-amber-700/20 bg-amber-50 px-4 py-3 text-sm text-[var(--ink)]">
          <p>
            <strong>{missingCount}</strong> student
            {missingCount === 1 ? "" : "s"} missing a parent phone — WhatsApp
            defaulters needs numbers.
          </p>
          <div className="mt-2 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={toggleMissingFilter}
              className="min-h-10 font-medium text-[var(--accent)] underline"
            >
              {missingOnly ? "Show all students" : "Show missing only"}
            </button>
            {canImport && (
              <span className="text-[var(--muted)]">
                Tap Edit phone on a row to add one.
              </span>
            )}
          </div>
        </div>
      )}

      {canImport && (
        <section className="mb-6">
          {!showImport ? (
            <button
              type="button"
              onClick={() => {
                setShowImport(true);
                setImportError(null);
              }}
              className="min-h-12 w-full rounded-lg border border-[var(--accent)] text-base font-medium text-[var(--accent)]"
            >
              Import students (CSV)
            </button>
          ) : (
            <form
              onSubmit={onImportSubmit}
              className="space-y-3 rounded-xl bg-[var(--surface)] p-4 shadow-sm"
            >
              {searchParams.get("import") === "1" && (
                <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-[var(--ink)]">
                  Class created. Import your student roster to start marking.
                </p>
              )}
              <h2 className="text-lg font-medium text-[var(--accent)]">
                Import CSV
              </h2>
              <p className="text-sm text-[var(--muted)]">
                With a header: <code className="text-xs">rollNumber</code>,{" "}
                <code className="text-xs">name</code>, optional{" "}
                <code className="text-xs">parentContact</code>. Or paste without
                a header —{" "}
                <code className="text-xs">1, Anushka, 958647826</code>. Max 200
                rows; bad rows are skipped with errors below.
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="min-h-11 rounded-lg border border-[var(--accent)] px-4 text-sm font-medium text-[var(--accent)]"
                >
                  Choose .csv file
                </button>
                <button
                  type="button"
                  onClick={downloadSample}
                  className="min-h-11 rounded-lg px-3 text-sm text-[var(--muted)] underline"
                >
                  Download sample
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,text/csv"
                  className="hidden"
                  onChange={(event) => void onFileChosen(event)}
                />
              </div>
              <label className="block text-sm">
                <span className="text-[var(--muted)]">Or paste CSV</span>
                <textarea
                  value={csvText}
                  onChange={(event) => setCsvText(event.target.value)}
                  rows={6}
                  placeholder={SAMPLE_CSV.trimEnd()}
                  className="mt-1 w-full rounded-lg border border-emerald-900/15 px-3 py-2 font-mono text-xs"
                />
              </label>
              {importError && (
                <p className="text-sm text-red-700">{importError}</p>
              )}
              {lastResult && (
                <div className="rounded-lg border border-emerald-900/10 bg-emerald-50/60 px-3 py-2 text-sm">
                  <p>
                    Imported <strong>{lastResult.imported}</strong>
                    {lastResult.failed > 0
                      ? ` · ${lastResult.failed} row(s) failed`
                      : ""}
                  </p>
                  {lastResult.errors.length > 0 && (
                    <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto text-red-800">
                      {lastResult.errors.map((rowError) => (
                        <li key={`${rowError.row}-${rowError.message}`}>
                          Row {rowError.row}: {rowError.message}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={importMutation.isPending}
                  className="min-h-12 flex-1 rounded-lg bg-[var(--accent)] text-base font-medium text-white disabled:opacity-60"
                >
                  {importMutation.isPending ? "Importing…" : "Import"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowImport(false);
                    setImportError(null);
                  }}
                  className="min-h-12 rounded-lg px-4 text-sm text-[var(--muted)] underline"
                >
                  Close
                </button>
              </div>
            </form>
          )}
        </section>
      )}

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

      {emptyList && (
        <p className="rounded-xl bg-[var(--surface)] px-4 py-6 text-[var(--muted)] shadow-sm">
          {missingOnly
            ? "Every student on this page has a parent phone."
            : q
              ? "No students match this search."
              : canImport
                ? "No students yet. Import a CSV above to build the roster."
                : "No students yet. Ask your class teacher to import the roster."}
        </p>
      )}

      <ul className="space-y-2">
        {(query.data?.items ?? []).map((student: StudentDto) => {
          const hasPhone = Boolean(toWhatsAppDigits(student.parentContact));
          const isEditing = editingId === student.id;

          return (
            <li
              key={student.id}
              className="rounded-xl bg-[var(--surface)] px-4 py-3 shadow-sm"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-lg font-medium">
                    <span className="text-[var(--muted)]">
                      #{student.rollNumber}
                    </span>{" "}
                    {student.name}
                  </p>
                  {!isEditing && (
                    <p
                      className={`mt-0.5 text-sm ${
                        hasPhone ? "text-[var(--muted)]" : "text-amber-800"
                      }`}
                    >
                      {displayPhone(student.parentContact)}
                    </p>
                  )}
                </div>
                <Link
                  to={`/classes/${classId}/students/${student.id}/report`}
                  className="shrink-0 text-sm text-[var(--accent)] underline"
                >
                  Report
                </Link>
              </div>

              {canImport && isEditing && (
                <div className="mt-3 space-y-2">
                  <label className="block text-sm">
                    <span className="text-[var(--muted)]">Parent mobile</span>
                    <input
                      value={phoneDraft}
                      onChange={(event) => setPhoneDraft(event.target.value)}
                      placeholder="9876543210"
                      inputMode="tel"
                      autoFocus
                      className="mt-1 w-full rounded-lg border border-emerald-900/15 px-3 py-3 text-base"
                    />
                  </label>
                  {phoneError && (
                    <p className="text-sm text-red-700">{phoneError}</p>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={updatePhoneMutation.isPending}
                      onClick={() => savePhone(student.id)}
                      className="min-h-11 flex-1 rounded-lg bg-[var(--accent)] px-3 text-sm font-medium text-white disabled:opacity-60"
                    >
                      {updatePhoneMutation.isPending ? "Saving…" : "Save"}
                    </button>
                    <button
                      type="button"
                      disabled={updatePhoneMutation.isPending}
                      onClick={() => {
                        setPhoneDraft("");
                        updatePhoneMutation.mutate({
                          studentId: student.id,
                          parentContact: "",
                        });
                      }}
                      className="min-h-11 rounded-lg border border-[var(--accent)] px-3 text-sm font-medium text-[var(--accent)] disabled:opacity-60"
                    >
                      Clear
                    </button>
                    <button
                      type="button"
                      disabled={updatePhoneMutation.isPending}
                      onClick={() => {
                        setEditingId(null);
                        setPhoneDraft("");
                        setPhoneError(null);
                      }}
                      className="min-h-11 rounded-lg px-3 text-sm text-[var(--muted)] underline disabled:opacity-60"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {canImport && !isEditing && (
                <div className="mt-2 flex gap-3">
                  <button
                    type="button"
                    onClick={() => startEdit(student)}
                    className="min-h-10 text-sm font-medium text-[var(--accent)] underline"
                  >
                    {hasPhone ? "Edit phone" : "Add phone"}
                  </button>
                </div>
              )}
            </li>
          );
        })}
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
