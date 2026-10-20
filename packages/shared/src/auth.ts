import { z } from "zod";
import { roleSchema } from "./enums.js";

/**
 * Indian mobile → E.164 (+91…). Accepts 10 digits, 0XXXXXXXXXX, or +91XXXXXXXXXX.
 */
export function normalizeIndianPhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  let national = digits;
  if (national.startsWith("91") && national.length === 12) {
    national = national.slice(2);
  } else if (national.startsWith("0") && national.length === 11) {
    national = national.slice(1);
  }
  if (!/^[6-9]\d{9}$/.test(national)) {
    return null;
  }
  return `+91${national}`;
}

export function maskPhone(e164: string): string {
  if (e164.length < 6) return e164;
  return `${e164.slice(0, 5)}******${e164.slice(-2)}`;
}

export const phoneSchema = z
  .string()
  .trim()
  .min(10)
  .max(16)
  .transform((value, ctx) => {
    const normalized = normalizeIndianPhone(value);
    if (!normalized) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Use a valid 10-digit Indian mobile number",
      });
      return z.NEVER;
    }
    return normalized;
  });

export const registerBodySchema = z.object({
  name: z.string().trim().min(1).max(100),
  email: z.string().trim().email().max(255),
  password: z.string().min(8).max(128),
  phone: phoneSchema,
});

export const verifyPhoneBodySchema = z.object({
  registrationId: z.string().min(1),
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, "Enter the 6-digit code"),
});

export const resendPhoneOtpBodySchema = z.object({
  registrationId: z.string().min(1),
});

export const loginBodySchema = z.object({
  email: z.string().trim().email().max(255),
  password: z.string().min(1).max(128),
});

export const authUserSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  email: z.string().email(),
  role: roleSchema,
  phone: z.string().nullable().optional(),
});

export const authTokensSchema = z.object({
  accessToken: z.string().min(1),
  user: authUserSchema,
});

export const registerPendingSchema = z.object({
  status: z.literal("otp_sent"),
  registrationId: z.string().min(1),
  phone: z.string().min(1),
  /** Only present when SMS_OTP_MODE=log (local/CI). Never in Twilio mode. */
  devCode: z
    .string()
    .regex(/^\d{6}$/)
    .optional(),
});

export type RegisterBody = z.infer<typeof registerBodySchema>;
export type VerifyPhoneBody = z.infer<typeof verifyPhoneBodySchema>;
export type ResendPhoneOtpBody = z.infer<typeof resendPhoneOtpBodySchema>;
export type LoginBody = z.infer<typeof loginBodySchema>;
export type AuthUser = z.infer<typeof authUserSchema>;
export type AuthTokens = z.infer<typeof authTokensSchema>;
export type RegisterPending = z.infer<typeof registerPendingSchema>;
