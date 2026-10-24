import { useState, type FormEvent } from "react";
import { Link, Navigate } from "react-router-dom";
import {
  forgotPasswordResponseSchema,
  type ForgotPasswordResponse,
} from "@classroom-tracker/shared";
import { ApiError, apiFetch } from "../api";
import { useAuth } from "../auth";

export function ForgotPasswordPage() {
  const { isAuthenticated, ready } = useAuth();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<ForgotPasswordResponse | null>(null);

  if (ready && isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setResult(null);
    setPending(true);
    try {
      const body = forgotPasswordResponseSchema.parse(
        await apiFetch<unknown>("/auth/forgot-password", {
          method: "POST",
          body: JSON.stringify({ email: email.trim() }),
        }),
      );
      setResult(body);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not start reset");
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-8">
      <h1 className="text-3xl font-semibold tracking-tight text-[var(--accent)]">
        Reset password
      </h1>
      <p className="mt-2 text-[var(--muted)]">
        Enter your email. If an account exists, we send a reset link (logged to
        the API console in demo mode).
      </p>

      {result ? (
        <div className="mt-8 space-y-4 rounded-xl bg-[var(--surface)] p-5 shadow-sm">
          <p className="text-sm text-[var(--ink)]">
            If that email is registered, a reset link is ready. Check the API
            console when running locally.
          </p>
          {result.devResetPath && (
            <div className="space-y-2">
              <p className="text-sm text-[var(--muted)]">
                Demo mode — open the link below:
              </p>
              <Link
                to={result.devResetPath}
                className="block break-all text-sm font-medium text-[var(--accent)] underline"
              >
                {result.devResetPath}
              </Link>
            </div>
          )}
          <Link
            to="/login"
            className="inline-block min-h-11 text-sm font-medium text-[var(--accent)] underline"
          >
            Back to sign in
          </Link>
        </div>
      ) : (
        <form
          onSubmit={onSubmit}
          className="mt-8 space-y-4 rounded-xl bg-[var(--surface)] p-5 shadow-sm"
        >
          <label className="block text-sm">
            <span className="text-[var(--muted)]">Email</span>
            <input
              className="mt-1 w-full rounded-lg border border-emerald-900/15 px-3 py-3 text-base"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </label>
          {error && <p className="text-sm text-red-700">{error}</p>}
          <button
            type="submit"
            disabled={pending}
            className="min-h-12 w-full rounded-lg bg-[var(--accent)] px-4 text-base font-medium text-white disabled:opacity-60"
          >
            {pending ? "Sending…" : "Send reset link"}
          </button>
        </form>
      )}

      <p className="mt-4 text-center text-sm text-[var(--muted)]">
        <Link to="/login" className="underline text-[var(--accent)]">
          Sign in
        </Link>
      </p>
    </main>
  );
}
