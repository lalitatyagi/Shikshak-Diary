import { useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../auth";
import { ApiError } from "../api";

export function RegisterPage() {
  const { register, isAuthenticated, ready } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  if (ready && isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setPending(true);
    try {
      const result = await register(
        name.trim(),
        email.trim(),
        password,
        phone.trim(),
      );
      void navigate("/verify-phone", {
        state: {
          registrationId: result.registrationId,
          phone: result.phone,
          devCode: result.devCode,
        },
      });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Sign up failed");
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-8">
      <h1 className="text-3xl font-semibold tracking-tight text-[var(--accent)]">
        Classroom Tracker
      </h1>
      <p className="mt-2 text-[var(--muted)]">
        Create a teacher account. We will SMS a one-time code to your mobile. An
        admin must still invite you to a school before you see classes.
      </p>

      <form
        onSubmit={onSubmit}
        className="mt-8 space-y-4 rounded-xl bg-[var(--surface)] p-5 shadow-sm"
      >
        <label className="block text-sm">
          <span className="text-[var(--muted)]">Name</span>
          <input
            className="mt-1 w-full rounded-lg border border-emerald-900/15 px-3 py-3 text-base"
            type="text"
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            maxLength={100}
          />
        </label>
        <label className="block text-sm">
          <span className="text-[var(--muted)]">Email</span>
          <input
            className="mt-1 w-full rounded-lg border border-emerald-900/15 px-3 py-3 text-base"
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </label>
        <label className="block text-sm">
          <span className="text-[var(--muted)]">Mobile number</span>
          <input
            className="mt-1 w-full rounded-lg border border-emerald-900/15 px-3 py-3 text-base"
            type="tel"
            autoComplete="tel"
            placeholder="10-digit Indian mobile"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            required
          />
        </label>
        <label className="block text-sm">
          <span className="text-[var(--muted)]">Password</span>
          <input
            className="mt-1 w-full rounded-lg border border-emerald-900/15 px-3 py-3 text-base"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
          />
        </label>
        {error && <p className="text-sm text-red-700">{error}</p>}
        <button
          type="submit"
          disabled={pending}
          className="min-h-12 w-full rounded-lg bg-[var(--accent)] px-4 text-base font-medium text-white disabled:opacity-60"
        >
          {pending ? "Sending code…" : "Continue"}
        </button>
      </form>
      <p className="mt-4 text-center text-sm text-[var(--muted)]">
        Already have an account?{" "}
        <Link to="/login" className="underline text-[var(--accent)]">
          Sign in
        </Link>
      </p>
    </main>
  );
}
