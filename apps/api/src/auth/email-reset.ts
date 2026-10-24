/**
 * Password-reset delivery mode.
 * log = print link to console + return devResetToken (local/CI).
 * smtp = reserved for a future mailer; falls back to log until configured.
 */
export type EmailResetMode = "log" | "smtp";

export function emailResetMode(): EmailResetMode {
  const raw = (process.env.EMAIL_RESET_MODE ?? "log").trim().toLowerCase();
  if (raw === "smtp") return "smtp";
  return "log";
}

/** Public web origin for reset links (first CORS origin, or WEB_APP_URL). */
export function webAppOrigin(): string {
  const explicit = (process.env.WEB_APP_URL ?? "").trim().replace(/\/$/, "");
  if (explicit) return explicit;
  const cors = (process.env.CORS_ORIGINS ?? "http://localhost:5173")
    .split(",")
    .map((s) => s.trim())
    .find(Boolean);
  return (cors ?? "http://localhost:5173").replace(/\/$/, "");
}

export async function deliverPasswordResetEmail(
  email: string,
  resetUrl: string,
): Promise<void> {
  if (emailResetMode() === "log") {
    console.info(`[email-reset:log] Password reset for ${email}: ${resetUrl}`);
    return;
  }
  // SMTP not wired yet — still log so local demos never break.
  console.info(
    `[email-reset:smtp-fallback] Password reset for ${email}: ${resetUrl}`,
  );
}
