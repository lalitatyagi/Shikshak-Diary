import { createHash, randomInt } from "node:crypto";

const OTP_TTL_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;

export function otpTtlMs(): number {
  return OTP_TTL_MS;
}

export function otpMaxAttempts(): number {
  return MAX_ATTEMPTS;
}

export function generateOtpCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

function otpPepper(): string {
  return (
    process.env.OTP_PEPPER ??
    process.env.JWT_ACCESS_SECRET ??
    "dev-otp-pepper-change-me"
  );
}

export function hashOtpCode(code: string): string {
  return createHash("sha256").update(`${otpPepper()}:${code}`).digest("hex");
}

export function otpCodesMatch(codeHash: string, presented: string): boolean {
  const presentedHash = hashOtpCode(presented);
  if (presentedHash.length !== codeHash.length) {
    return false;
  }
  let diff = 0;
  for (let i = 0; i < presentedHash.length; i += 1) {
    diff |= presentedHash.charCodeAt(i) ^ codeHash.charCodeAt(i);
  }
  return diff === 0;
}
