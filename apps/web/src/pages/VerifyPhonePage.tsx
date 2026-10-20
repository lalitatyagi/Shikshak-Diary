import { useState, type FormEvent } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { registerPendingSchema } from "@classroom-tracker/shared";
import { useAuth } from "../auth";
import { ApiError, apiFetch } from "../api";

type LocationState = {
  registrationId?: string;
  phone?: string;
  devCode?: string;
};

export function VerifyPhonePage() {
  const { completeRegistration, isAuthenticated, ready } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const state = (location.state ?? {}) as LocationState;

  const [registrationId] = useState(state.registrationId ?? "");
  const [phone] = useState(state.phone ?? "");
  const [code, setCode] = useState(state.devCode ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [resendHint, setResendHint] = useState<string | null>(
    state.devCode ? `Dev mode code: ${state.devCode}` : null,
  );

  if (ready && isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  if (!registrationId) {
    return <Navigate to="/register" replace />;
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setPending(true);
    try {
      await completeRegistration(registrationId, code.trim());
      void navigate("/");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Verification failed");
    } finally {
      setPending(false);
    }
  }

  async function onResend() {
    setError(null);
    setResendHint(null);
    try {
      const pendingRes = registerPendingSchema.parse(
        await apiFetch<unknown>("/auth/resend-otp", {
          method: "POST",
          body: JSON.stringify({ registrationId }),
        }),
      );
      if (pendingRes.devCode) {
        setCode(pendingRes.devCode);
        setResendHint(`Dev mode code: ${pendingRes.devCode}`);
      } else {
        setResendHint("A new code was sent by SMS.");
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not resend code");
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-8">
      <h1 className="text-3xl font-semibold tracking-tight text-[var(--accent)]">
        Verify mobile
      </h1>
      <p className="mt-2 text-[var(--muted)]">
        Enter the 6-digit code sent to {phone || "your phone"}.
      </p>

      <form
        onSubmit={onSubmit}
        className="mt-8 space-y-4 rounded-xl bg-[var(--surface)] p-5 shadow-sm"
      >
        <label className="block text-sm">
          <span className="text-[var(--muted)]">OTP code</span>
          <input
            className="mt-1 w-full rounded-lg border border-emerald-900/15 px-3 py-3 text-center text-2xl tracking-[0.4em]"
            inputMode="numeric"
            autoComplete="one-time-code"
            value={code}
            onChange={(e) =>
              setCode(e.target.value.replace(/\D/g, "").slice(0, 6))
            }
            required
            minLength={6}
            maxLength={6}
          />
        </label>
        {resendHint && (
          <p className="text-sm text-[var(--muted)]">{resendHint}</p>
        )}
        {error && <p className="text-sm text-red-700">{error}</p>}
        <button
          type="submit"
          disabled={pending || code.length !== 6}
          className="min-h-12 w-full rounded-lg bg-[var(--accent)] px-4 text-base font-medium text-white disabled:opacity-60"
        >
          {pending ? "Verifying…" : "Verify and continue"}
        </button>
        <button
          type="button"
          onClick={() => void onResend()}
          className="min-h-11 w-full text-sm text-[var(--accent)] underline"
        >
          Resend code
        </button>
      </form>
      <p className="mt-4 text-center text-sm text-[var(--muted)]">
        <Link to="/register" className="underline text-[var(--accent)]">
          Back to sign up
        </Link>
      </p>
    </main>
  );
}
