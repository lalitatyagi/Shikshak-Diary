import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type FormEvent } from "react";
import { Link, Navigate } from "react-router-dom";
import {
  canManageSchool,
  classSchema,
  schoolMemberSchema,
  schoolSchema,
  type ClassDto,
  type SchoolDto,
  type SchoolMemberDto,
} from "@classroom-tracker/shared";
import { z } from "zod";
import { ApiError, apiFetch } from "../api";
import { useAuth } from "../auth";

const schoolsSchema = z.array(schoolSchema);
const membersSchema = z.array(schoolMemberSchema);
const classesSchema = z.array(classSchema);

type Tab = "teachers" | "classes" | "school";

export function AdminSchoolsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>("teachers");
  const [schoolId, setSchoolId] = useState("");
  const [schoolName, setSchoolName] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  // Add teacher
  const [teacherName, setTeacherName] = useState("");
  const [teacherEmail, setTeacherEmail] = useState("");
  const [teacherPassword, setTeacherPassword] = useState("");
  const [teacherPhone, setTeacherPhone] = useState("");
  const [teacherRole, setTeacherRole] = useState<"TEACHER" | "CLASS_TEACHER">(
    "TEACHER",
  );

  // Invite existing
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"TEACHER" | "CLASS_TEACHER">(
    "TEACHER",
  );

  // Assign to class
  const [assignTeacherId, setAssignTeacherId] = useState("");
  const [assignClassId, setAssignClassId] = useState("");
  const [assignSubject, setAssignSubject] = useState("General");

  // New class
  const [className, setClassName] = useState("");
  const [academicYear, setAcademicYear] = useState("2025-26");
  const [classSubject, setClassSubject] = useState("General");

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

  const classesQuery = useQuery({
    queryKey: ["school-classes", schoolId],
    enabled: isAdmin && Boolean(schoolId),
    queryFn: async () =>
      classesSchema.parse(
        await apiFetch<unknown>(`/schools/${schoolId}/classes`),
      ),
  });

  const members = membersQuery.data ?? [];
  const schoolClasses = classesQuery.data ?? [];

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
      setNote(`Created school ${school.name}`);
      setSchoolId(school.id);
      await queryClient.invalidateQueries({ queryKey: ["schools"] });
    },
    onError: (err) => {
      setNote(null);
      setFormError(
        err instanceof ApiError ? err.message : "Could not create school",
      );
    },
  });

  const addTeacher = useMutation({
    mutationFn: async () =>
      schoolMemberSchema.parse(
        await apiFetch<unknown>(`/schools/${schoolId}/teachers`, {
          method: "POST",
          body: JSON.stringify({
            name: teacherName.trim(),
            email: teacherEmail.trim(),
            password: teacherPassword,
            role: teacherRole,
            phone: teacherPhone.trim() || undefined,
          }),
        }),
      ),
    onSuccess: async (member) => {
      setTeacherName("");
      setTeacherEmail("");
      setTeacherPassword("");
      setTeacherPhone("");
      setFormError(null);
      setNote(`Created ${member.name} (${member.email})`);
      await queryClient.invalidateQueries({
        queryKey: ["school-members", schoolId],
      });
    },
    onError: (err) => {
      setNote(null);
      setFormError(
        err instanceof ApiError ? err.message : "Could not add teacher",
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
      setNote(`Invited ${member.email} as ${member.role}`);
      await queryClient.invalidateQueries({
        queryKey: ["school-members", schoolId],
      });
    },
    onError: (err) => {
      setNote(null);
      setFormError(
        err instanceof ApiError ? err.message : "Could not invite teacher",
      );
    },
  });

  const createClass = useMutation({
    mutationFn: async () =>
      classSchema.parse(
        await apiFetch<unknown>("/classes", {
          method: "POST",
          body: JSON.stringify({
            schoolId,
            name: className.trim(),
            academicYear: academicYear.trim(),
            subjectName: classSubject.trim() || "General",
          }),
        }),
      ),
    onSuccess: async (classroom) => {
      setClassName("");
      setFormError(null);
      setNote(`Created class ${classroom.name}`);
      await queryClient.invalidateQueries({
        queryKey: ["school-classes", schoolId],
      });
      await queryClient.invalidateQueries({ queryKey: ["home"] });
      await queryClient.invalidateQueries({ queryKey: ["classes"] });
    },
    onError: (err) => {
      setNote(null);
      setFormError(
        err instanceof ApiError ? err.message : "Could not create class",
      );
    },
  });

  const assignTeacher = useMutation({
    mutationFn: async () =>
      apiFetch<{ classId: string; teacherId: string; subjectName: string }>(
        `/classes/${assignClassId}/assignments`,
        {
          method: "POST",
          body: JSON.stringify({
            teacherId: assignTeacherId,
            subjectName: assignSubject.trim() || "General",
          }),
        },
      ),
    onSuccess: async () => {
      setFormError(null);
      setNote("Teacher assigned to class");
      await queryClient.invalidateQueries({
        queryKey: ["school-members", schoolId],
      });
      await queryClient.invalidateQueries({ queryKey: ["home"] });
    },
    onError: (err) => {
      setNote(null);
      setFormError(
        err instanceof ApiError ? err.message : "Could not assign teacher",
      );
    },
  });

  if (user && !isAdmin) {
    return <Navigate to="/" replace />;
  }

  return (
    <main className="mx-auto min-h-screen max-w-lg px-4 py-6">
      <header className="mb-4">
        <Link to="/" className="text-sm text-[var(--muted)] underline">
          ← All classes
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-[var(--accent)]">
          School admin
        </h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Manage schools, teachers, and classes.
        </p>
      </header>

      {schools.length > 0 && (
        <label className="mb-4 block text-sm">
          <span className="text-[var(--muted)]">School</span>
          <select
            className="mt-1 w-full rounded-lg border border-emerald-900/15 px-3 py-3 text-base"
            value={schoolId}
            onChange={(e) => setSchoolId(e.target.value)}
          >
            <option value="">Select school</option>
            {schools.map((school: SchoolDto) => (
              <option key={school.id} value={school.id}>
                {school.name}
              </option>
            ))}
          </select>
        </label>
      )}

      <div className="mb-4 flex gap-1">
        {(
          [
            ["teachers", "Teachers"],
            ["classes", "Classes"],
            ["school", "School"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => {
              setTab(id);
              setFormError(null);
              setNote(null);
            }}
            className={`min-h-11 flex-1 rounded-lg text-sm font-medium ${
              tab === id
                ? "bg-[var(--accent)] text-white"
                : "bg-[var(--surface)] text-[var(--ink)] shadow-sm"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {formError && (
        <p className="mb-3 text-sm text-red-700" role="alert">
          {formError}
        </p>
      )}
      {note && <p className="mb-3 text-sm text-[var(--muted)]">{note}</p>}

      {tab === "school" && (
        <section className="space-y-4 rounded-xl bg-[var(--surface)] p-4 shadow-sm">
          <h2 className="text-lg font-medium text-[var(--accent)]">
            New school
          </h2>
          <form
            onSubmit={(e: FormEvent) => {
              e.preventDefault();
              setFormError(null);
              createSchool.mutate();
            }}
            className="space-y-3"
          >
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
      )}

      {tab === "teachers" && (
        <div className="space-y-4">
          {!schoolId ? (
            <p className="text-sm text-[var(--muted)]">
              Select or create a school first (School tab).
            </p>
          ) : (
            <>
              <section className="rounded-xl bg-[var(--surface)] p-4 shadow-sm">
                <h2 className="text-lg font-medium text-[var(--accent)]">
                  Add teacher
                </h2>
                <p className="mt-1 text-sm text-[var(--muted)]">
                  Creates a login and adds them to this school (no SMS OTP).
                </p>
                <form
                  onSubmit={(e: FormEvent) => {
                    e.preventDefault();
                    setFormError(null);
                    setNote(null);
                    addTeacher.mutate();
                  }}
                  className="mt-3 space-y-3"
                >
                  <label className="block text-sm">
                    <span className="text-[var(--muted)]">Name</span>
                    <input
                      className="mt-1 w-full rounded-lg border border-emerald-900/15 px-3 py-3"
                      value={teacherName}
                      onChange={(e) => setTeacherName(e.target.value)}
                      required
                    />
                  </label>
                  <label className="block text-sm">
                    <span className="text-[var(--muted)]">Email</span>
                    <input
                      type="email"
                      className="mt-1 w-full rounded-lg border border-emerald-900/15 px-3 py-3"
                      value={teacherEmail}
                      onChange={(e) => setTeacherEmail(e.target.value)}
                      required
                    />
                  </label>
                  <label className="block text-sm">
                    <span className="text-[var(--muted)]">Password</span>
                    <input
                      type="password"
                      minLength={8}
                      className="mt-1 w-full rounded-lg border border-emerald-900/15 px-3 py-3"
                      value={teacherPassword}
                      onChange={(e) => setTeacherPassword(e.target.value)}
                      required
                    />
                  </label>
                  <label className="block text-sm">
                    <span className="text-[var(--muted)]">
                      Mobile (optional)
                    </span>
                    <input
                      type="tel"
                      className="mt-1 w-full rounded-lg border border-emerald-900/15 px-3 py-3"
                      value={teacherPhone}
                      onChange={(e) => setTeacherPhone(e.target.value)}
                      placeholder="10-digit Indian mobile"
                    />
                  </label>
                  <label className="block text-sm">
                    <span className="text-[var(--muted)]">Role</span>
                    <select
                      className="mt-1 w-full rounded-lg border border-emerald-900/15 px-3 py-3"
                      value={teacherRole}
                      onChange={(e) =>
                        setTeacherRole(
                          e.target.value as "TEACHER" | "CLASS_TEACHER",
                        )
                      }
                    >
                      <option value="TEACHER">Subject teacher</option>
                      <option value="CLASS_TEACHER">
                        Class teacher (roster)
                      </option>
                    </select>
                  </label>
                  <button
                    type="submit"
                    disabled={addTeacher.isPending}
                    className="min-h-12 w-full rounded-lg bg-[var(--accent)] text-base font-medium text-white disabled:opacity-60"
                  >
                    {addTeacher.isPending ? "Adding…" : "Add teacher"}
                  </button>
                </form>
              </section>

              <section className="rounded-xl bg-[var(--surface)] p-4 shadow-sm">
                <h2 className="text-lg font-medium text-[var(--accent)]">
                  Invite existing account
                </h2>
                <p className="mt-1 text-sm text-[var(--muted)]">
                  For someone who already signed up themselves.
                </p>
                <form
                  onSubmit={(e: FormEvent) => {
                    e.preventDefault();
                    setFormError(null);
                    setNote(null);
                    inviteMember.mutate();
                  }}
                  className="mt-3 space-y-3"
                >
                  <label className="block text-sm">
                    <span className="text-[var(--muted)]">Email</span>
                    <input
                      type="email"
                      className="mt-1 w-full rounded-lg border border-emerald-900/15 px-3 py-3"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      required
                    />
                  </label>
                  <label className="block text-sm">
                    <span className="text-[var(--muted)]">Role</span>
                    <select
                      className="mt-1 w-full rounded-lg border border-emerald-900/15 px-3 py-3"
                      value={inviteRole}
                      onChange={(e) =>
                        setInviteRole(
                          e.target.value as "TEACHER" | "CLASS_TEACHER",
                        )
                      }
                    >
                      <option value="TEACHER">Subject teacher</option>
                      <option value="CLASS_TEACHER">Class teacher</option>
                    </select>
                  </label>
                  <button
                    type="submit"
                    disabled={inviteMember.isPending}
                    className="min-h-12 w-full rounded-lg border border-[var(--accent)] text-base font-medium text-[var(--accent)] disabled:opacity-60"
                  >
                    {inviteMember.isPending ? "Inviting…" : "Invite"}
                  </button>
                </form>
              </section>

              <section className="rounded-xl bg-[var(--surface)] p-4 shadow-sm">
                <h2 className="text-lg font-medium text-[var(--accent)]">
                  Assign to class
                </h2>
                <p className="mt-1 text-sm text-[var(--muted)]">
                  Teachers only see classes they are assigned to.
                </p>
                <form
                  onSubmit={(e: FormEvent) => {
                    e.preventDefault();
                    setFormError(null);
                    setNote(null);
                    assignTeacher.mutate();
                  }}
                  className="mt-3 space-y-3"
                >
                  <label className="block text-sm">
                    <span className="text-[var(--muted)]">Teacher</span>
                    <select
                      className="mt-1 w-full rounded-lg border border-emerald-900/15 px-3 py-3"
                      value={assignTeacherId}
                      onChange={(e) => setAssignTeacherId(e.target.value)}
                      required
                    >
                      <option value="">Select teacher</option>
                      {members.map((m) => (
                        <option key={m.userId} value={m.userId}>
                          {m.name} ({m.email})
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block text-sm">
                    <span className="text-[var(--muted)]">Class</span>
                    <select
                      className="mt-1 w-full rounded-lg border border-emerald-900/15 px-3 py-3"
                      value={assignClassId}
                      onChange={(e) => setAssignClassId(e.target.value)}
                      required
                    >
                      <option value="">Select class</option>
                      {schoolClasses.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} ({c.academicYear})
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block text-sm">
                    <span className="text-[var(--muted)]">Subject</span>
                    <input
                      className="mt-1 w-full rounded-lg border border-emerald-900/15 px-3 py-3"
                      value={assignSubject}
                      onChange={(e) => setAssignSubject(e.target.value)}
                      required
                    />
                  </label>
                  <button
                    type="submit"
                    disabled={
                      assignTeacher.isPending ||
                      !assignTeacherId ||
                      !assignClassId
                    }
                    className="min-h-12 w-full rounded-lg bg-[var(--accent)] text-base font-medium text-white disabled:opacity-60"
                  >
                    {assignTeacher.isPending ? "Assigning…" : "Assign"}
                  </button>
                </form>
              </section>

              <section className="rounded-xl bg-[var(--surface)] p-4 shadow-sm">
                <h2 className="text-lg font-medium text-[var(--accent)]">
                  All teachers ({members.length})
                </h2>
                {membersQuery.isPending && (
                  <p className="mt-3 text-sm text-[var(--muted)]">Loading…</p>
                )}
                {members.length === 0 && !membersQuery.isPending && (
                  <p className="mt-3 text-sm text-[var(--muted)]">
                    No teachers yet. Add one above.
                  </p>
                )}
                <ul className="mt-3 space-y-3">
                  {members.map((member: SchoolMemberDto) => (
                    <li
                      key={member.userId}
                      className="border-b border-emerald-900/10 pb-3 text-sm last:border-0"
                    >
                      <p className="font-medium">{member.name}</p>
                      <p className="text-[var(--muted)]">{member.email}</p>
                      <p className="mt-1 text-[var(--muted)]">
                        {member.role === "CLASS_TEACHER"
                          ? "Class teacher"
                          : member.role === "TEACHER"
                            ? "Subject teacher"
                            : member.role}
                        {member.classNames.length > 0
                          ? ` · ${member.classNames.join(", ")}`
                          : " · no class assigned"}
                      </p>
                    </li>
                  ))}
                </ul>
              </section>
            </>
          )}
        </div>
      )}

      {tab === "classes" && (
        <div className="space-y-4">
          {!schoolId ? (
            <p className="text-sm text-[var(--muted)]">
              Select or create a school first (School tab).
            </p>
          ) : (
            <>
              <section className="rounded-xl bg-[var(--surface)] p-4 shadow-sm">
                <h2 className="text-lg font-medium text-[var(--accent)]">
                  New class
                </h2>
                <form
                  onSubmit={(e: FormEvent) => {
                    e.preventDefault();
                    setFormError(null);
                    setNote(null);
                    createClass.mutate();
                  }}
                  className="mt-3 space-y-3"
                >
                  <label className="block text-sm">
                    <span className="text-[var(--muted)]">Class name</span>
                    <input
                      className="mt-1 w-full rounded-lg border border-emerald-900/15 px-3 py-3"
                      value={className}
                      onChange={(e) => setClassName(e.target.value)}
                      placeholder="e.g. 9-A"
                      required
                    />
                  </label>
                  <label className="block text-sm">
                    <span className="text-[var(--muted)]">Academic year</span>
                    <input
                      className="mt-1 w-full rounded-lg border border-emerald-900/15 px-3 py-3"
                      value={academicYear}
                      onChange={(e) => setAcademicYear(e.target.value)}
                      required
                    />
                  </label>
                  <label className="block text-sm">
                    <span className="text-[var(--muted)]">Your subject</span>
                    <input
                      className="mt-1 w-full rounded-lg border border-emerald-900/15 px-3 py-3"
                      value={classSubject}
                      onChange={(e) => setClassSubject(e.target.value)}
                    />
                  </label>
                  <button
                    type="submit"
                    disabled={createClass.isPending}
                    className="min-h-12 w-full rounded-lg bg-[var(--accent)] text-base font-medium text-white disabled:opacity-60"
                  >
                    {createClass.isPending ? "Creating…" : "Create class"}
                  </button>
                </form>
              </section>

              <section className="rounded-xl bg-[var(--surface)] p-4 shadow-sm">
                <h2 className="text-lg font-medium text-[var(--accent)]">
                  All classes ({schoolClasses.length})
                </h2>
                {classesQuery.isPending && (
                  <p className="mt-3 text-sm text-[var(--muted)]">Loading…</p>
                )}
                {schoolClasses.length === 0 && !classesQuery.isPending && (
                  <p className="mt-3 text-sm text-[var(--muted)]">
                    No classes yet.
                  </p>
                )}
                <ul className="mt-3 space-y-3">
                  {schoolClasses.map((classroom: ClassDto) => (
                    <li
                      key={classroom.id}
                      className="rounded-lg border border-emerald-900/10 px-3 py-3"
                    >
                      <p className="font-medium">
                        {classroom.name}{" "}
                        <span className="text-sm font-normal text-[var(--muted)]">
                          {classroom.academicYear}
                          {classroom.studentCount != null
                            ? ` · ${classroom.studentCount} students`
                            : ""}
                        </span>
                      </p>
                      <div className="mt-2 grid grid-cols-3 gap-2 text-sm">
                        <Link
                          to={`/classes/${classroom.id}/grid`}
                          className="flex min-h-10 items-center justify-center rounded-lg bg-[var(--accent)] font-medium text-white"
                        >
                          Grid
                        </Link>
                        <Link
                          to={`/classes/${classroom.id}/students`}
                          className="flex min-h-10 items-center justify-center rounded-lg border border-[var(--accent)] font-medium text-[var(--accent)]"
                        >
                          Students
                        </Link>
                        <Link
                          to={`/classes/${classroom.id}/defaulters`}
                          className="flex min-h-10 items-center justify-center rounded-lg border border-[var(--accent)] font-medium text-[var(--accent)]"
                        >
                          Defaulters
                        </Link>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            </>
          )}
        </div>
      )}
    </main>
  );
}
