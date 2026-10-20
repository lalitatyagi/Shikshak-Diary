import twilio from "twilio";

export type SmsOtpMode = "twilio" | "log";

export function smsOtpMode(): SmsOtpMode {
  const raw = (process.env.SMS_OTP_MODE ?? "").trim().toLowerCase();
  if (raw === "log" || raw === "twilio") {
    return raw;
  }
  // Prefer Twilio when credentials exist; otherwise log (local / CI).
  if (
    process.env.TWILIO_ACCOUNT_SID &&
    process.env.TWILIO_AUTH_TOKEN &&
    process.env.TWILIO_FROM_NUMBER
  ) {
    return "twilio";
  }
  return "log";
}

export async function sendOtpSms(
  phoneE164: string,
  code: string,
): Promise<void> {
  const mode = smsOtpMode();
  const body = `Classroom Tracker code: ${code}. Valid for 10 minutes.`;

  if (mode === "log") {
    console.info(`[sms:log] OTP for ${phoneE164}: ${code}`);
    return;
  }

  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM_NUMBER;
  if (!sid || !token || !from) {
    throw new Error(
      "Twilio is not configured. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER (or SMS_OTP_MODE=log).",
    );
  }

  const client = twilio(sid, token);
  await client.messages.create({
    to: phoneE164,
    from,
    body,
  });
}
