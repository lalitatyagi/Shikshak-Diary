import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type FormEvent } from "react";
import { Link, Navigate } from "react-router-dom";
import {
  canManageSchool,
  schoolMemberSchema,
  schoolSchema,
  type SchoolDto,
  type SchoolMemberDto,
} from "@classroom-tracker/shared";
import { z } from "zod";
import { ApiError, apiFetch } from "../api";
import { useAuth } from "../auth";

const schoolsSchema = z.array(schoolSchema);
const membersSchema = z.array(schoolMemberSchema);

export function AdminSchoolsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [schoolId, setSchoolId] = useState("");
  const [schoolName, setSchoolName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"TEACHER" | "CLASS_TEACHER">(
    "TEACHER",
  );
  const [formError, setFormError] = useState<string | null>(null);
  const [inviteNote, setInviteNote] = useState<string | null>(null);
  const isAdmin = Boolean(user && canManageSchool(user.role));

  const schoolsQuery = useQuery({
    queryKey: ["schools"],
    enabled: isAdmin,
    queryFn: async () =>
      schoolsSchema.parse(await apiFetch<unknown>("/schools")),
  });

  const schools = schoolsQuery.data ?? [];

  useEffect(() => {
    if (schools.length === 1 && !schoolId) {
      setSchoolId(schools[0]!.id);
    }
  }, [schools, schoolId]);

  const membersQuery = useQuery({
    queryKey: ["school-members", schoolId],
    enabled: isAdmin && Boolean(schoolId),
    queryFn: async () =>
      membersSchema.parse(
        await apiFetch<unknown>(`/schools/${schoolId}/members`),
      ),
  });

  const createSchool = useMutation({
    mutationFn: async () =>
      schoolSchema.parse(
        await apiFetch<unknown>("/schools", {
          method: "POST",
          body: JSON.stringify({ name: schoolName.trim() }),
        }),
      ),
    onSuccess: async (school) => {
      setSchoolName("");
      setFormError(null);
      setSchoolId(school.id);
      await queryClient.invalidateQueries({ queryKey: ["schools"] });
    },
    onError: (err) => {
      setFormError(
        err instanceof ApiError ? err.message : "Could not create school",
      );
    },
  });

  const inviteMember = useMutation({
    mutationFn: async () =>
      schoolMemberSchema.parse(
        await apiFetch<unknown>(`/schools/${schoolId}/members`, {
          method: "POST",
          body: JSON.stringify({
            email: inviteEmail.trim(),
            role: inviteRole,
          }),
        }),
      ),
    onSuccess: async (member) => {
      setInviteEmail("");
      setFormError(null);
      setInviteNote(`Invited ${member.email} as ${member.role}`);
      await queryClient.invalidateQueries({
        queryKey: ["school-members", schoolId],
      });
    },
    onError: (err) => {
      setInviteNote(null);
      setFormError(
        err instanceof ApiError ? err.message : "Could not invite teacher",
      );
    },
  });

  function onCreateSchool(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    createSchool.mutate();
  }

  function onInvite(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    setInviteNote(null);
    if (!schoolId) {
      setFormError("Pick or create a school first.");
      return;
    }
    inviteMember.mutate();
  }

  if (user && !isAdmin) {
    return <Navigate to="/" replace />;
  }

  return (
    <main className="mx-auto min-h-screen max-w-lg px-4 py-6">
      <header className="mb-6">
        <Link to="/" className="text-sm text-[var(--muted)] underline">
          ← Today
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-[var(--accent)]">
          School admin
        </h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Create a school and invite registered teachers by email.
        </p>
      </header>

      <section className="mb-6 rounded-xl bg-[var(--surface)] p-4 shadow-sm">
        <h2 className="text-lg font-medium text-[var(--accent)]">New school</h2>
        <form onSubmit={onCreateSchool} className="mt-3 space-y-3">
          <label className="block text-sm">
            <span className="text-[var(--muted)]">School name</span>
            <input
              className="mt-1 w-full rounded-lg border border-emerald-900/15 px-3 py-3 text-base"
              value={schoolName}
              onChange={(e) => setSchoolName(e.target.value)}
              placeholder="e.g. Green Valley Public School"
              required
              maxLength={120}
            />
          </label>
          <button
            type="submit"
            disabled={createSchool.isPending}
            className="min-h-12 w-full rounded-lg bg-[var(--accent)] text-base font-medium text-white disabled:opacity-60"
          >
            {createSchool.isPending ? "Creating…" : "Create school"}
          </button>
        </form>
      </section>

      <section className="mb-6 rounded-xl bg-[var(--surface)] p-4 shadow-sm">
        <h2 className="text-lg font-medium text-[var(--accent)]">
          Invite teacher
        </h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          They must already have signed up. After invite they can create classes
          in this school.
        </p>
        <form onSubmit={onInvite} className="mt-3 space-y-3">
          {schools.length > 0 ? (
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
              Create a school above first.
            </p>
          )}
          <label className="block text-sm">
            <span className="text-[var(--muted)]">Teacher email</span>
            <input
              type="email"
              className="mt-1 w-full rounded-lg border border-emerald-900/15 px-3 py-3 text-base"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="teacher@school.edu"
              required
            />
          </label>
          <label className="block text-sm">
            <span className="text-[var(--muted)]">Role</span>
            <select
              className="mt-1 w-full rounded-lg border border-emerald-900/15 px-3 py-3 text-base"
              value={inviteRole}
              onChange={(e) =>
                setInviteRole(e.target.value as "TEACHER" | "CLASS_TEACHER")
              }
            >
              <option value="TEACHER">Subject teacher</option>
              <option value="CLASS_TEACHER">Class teacher (roster)</option>
            </select>
          </label>
          {formError && <p className="text-sm text-red-700">{formError}</p>}
          {inviteNote && (
            <p className="text-sm text-[var(--muted)]">{inviteNote}</p>
          )}
          <button
            type="submit"
            disabled={inviteMember.isPending || !schoolId}
            className="min-h-12 w-full rounded-lg bg-[var(--accent)] text-base font-medium text-white disabled:opacity-60"
          >
            {inviteMember.isPending ? "Inviting…" : "Invite"}
          </button>
        </form>
      </section>

      {schoolId && (
        <section className="rounded-xl bg-[var(--surface)] p-4 shadow-sm">
          <h2 className="text-lg font-medium text-[var(--accent)]">Members</h2>
          {membersQuery.isPending && (
            <p className="mt-3 text-sm text-[var(--muted)]">Loading…</p>
          )}
          {membersQuery.isError && (
            <p className="mt-3 text-sm text-red-700">Could not load members.</p>
          )}
          {membersQuery.data && membersQuery.data.length === 0 && (
            <p className="mt-3 text-sm text-[var(--muted)]">
              No teachers in this school yet.
            </p>
          )}
          <ul className="mt-3 space-y-2">
            {(membersQuery.data ?? []).map((member: SchoolMemberDto) => (
              <li
                key={member.userId}
                className="flex items-start justify-between gap-2 border-b border-emerald-900/10 pb-2 text-sm last:border-0"
              >
                <div>
                  <p className="font-medium">{member.name}</p>
                  <p className="text-[var(--muted)]">{member.email}</p>
                </div>
                <span className="shrink-0 text-[var(--muted)]">
                  {member.role === "CLASS_TEACHER"
                    ? "Class teacher"
                    : member.role === "TEACHER"
                      ? "Teacher"
                      : member.role}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
