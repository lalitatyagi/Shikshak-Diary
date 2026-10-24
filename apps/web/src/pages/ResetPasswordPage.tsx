import { useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { ApiError, apiFetch } from "../api";
import { useAuth } from "../auth";

export function ResetPasswordPage() {
  const { isAuthenticated, ready } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = (searchParams.get("token") ?? "").trim();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  if (ready && isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    if (!token) {
      setError("Missing reset token. Use the link from your email.");
      return;
    }
    setPending(true);
    try {
      await apiFetch("/auth/reset-password", {
        method: "POST",
        body: JSON.stringify({ token, password }),
      });
      void navigate("/login", { replace: true });
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Could not reset password",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-8">
      <h1 className="text-3xl font-semibold tracking-tight text-[var(--accent)]">
        Choose a new password
      </h1>
      <p className="mt-2 text-[var(--muted)]">
        After saving, sign in with your new password.
      </p>

      {!token ? (
        <p className="mt-8 text-sm text-red-700">
          This page needs a reset token. Request a new link from{" "}
          <Link to="/forgot-password" className="underline">
            forgot password
          </Link>
          .
        </p>
      ) : (
        <form
          onSubmit={onSubmit}
          className="mt-8 space-y-4 rounded-xl bg-[var(--surface)] p-5 shadow-sm"
        >
          <label className="block text-sm">
            <span className="text-[var(--muted)]">New password</span>
            <input
              className="mt-1 w-full rounded-lg border border-emerald-900/15 px-3 py-3 text-base"
              type="password"
              autoComplete="new-password"
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>
          <label className="block text-sm">
            <span className="text-[var(--muted)]">Confirm password</span>
            <input
              className="mt-1 w-full rounded-lg border border-emerald-900/15 px-3 py-3 text-base"
              type="password"
              autoComplete="new-password"
              minLength={8}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
            />
          </label>
          {error && <p className="text-sm text-red-700">{error}</p>}
          <button
            type="submit"
            disabled={pending}
            className="min-h-12 w-full rounded-lg bg-[var(--accent)] px-4 text-base font-medium text-white disabled:opacity-60"
          >
            {pending ? "Saving…" : "Save password"}
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
