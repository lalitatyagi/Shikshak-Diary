import { useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../auth";
import { ApiError } from "../api";

export function LoginPage() {
  const { login, isAuthenticated, ready } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("teacher@demo.local");
  const [password, setPassword] = useState("Teacher123!");
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
      await login(email.trim(), password);
      void navigate("/");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Login failed");
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-8">
      <h1 className="text-3xl font-semibold tracking-tight text-[var(--accent)]">
        Classroom Tracker
      </h1>
      <p className="mt-2 text-[var(--muted)]">Sign in to mark your class.</p>

      <form
        onSubmit={onSubmit}
        className="mt-8 space-y-4 rounded-xl bg-[var(--surface)] p-5 shadow-sm"
      >
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
          <span className="text-[var(--muted)]">Password</span>
          <input
            className="mt-1 w-full rounded-lg border border-emerald-900/15 px-3 py-3 text-base"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>
        {error && <p className="text-sm text-red-700">{error}</p>}
        <button
          type="submit"
          disabled={pending}
          className="min-h-12 w-full rounded-lg bg-[var(--accent)] px-4 text-base font-medium text-white disabled:opacity-60"
        >
          {pending ? "Signing in…" : "Sign in"}
        </button>
      </form>
      <p className="mt-4 text-center text-sm text-[var(--muted)]">
        <Link to="/health" className="underline">
          API health
        </Link>
      </p>
    </main>
  );
}
