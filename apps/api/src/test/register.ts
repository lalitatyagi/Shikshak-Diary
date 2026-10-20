import type { FastifyInstance, LightMyRequestResponse } from "fastify";
import { expect } from "vitest";

let phoneSeq = 0;

/** Unique Indian E.164 for parallel tests. */
export function uniquePhone(): string {
  phoneSeq += 1;
  const suffix =
    String(Date.now()).slice(-7) + String(phoneSeq % 100).padStart(2, "0");
  // Keep first digit 9 so it stays a valid mobile prefix.
  return `+919${suffix.slice(0, 9)}`;
}

/**
 * Full sign-up under SMS_OTP_MODE=log (devCode returned).
 * Use this instead of a bare POST /auth/register in route tests.
 */
export async function registerVerifiedTeacher(
  app: FastifyInstance,
  input: {
    name: string;
    email: string;
    password: string;
    phone?: string;
  },
): Promise<LightMyRequestResponse> {
  const phone = input.phone ?? uniquePhone();
  const pending = await app.inject({
    method: "POST",
    url: "/auth/register",
    payload: {
      name: input.name,
      email: input.email,
      password: input.password,
      phone,
    },
  });
  expect(pending.statusCode).toBe(201);
  const body = pending.json() as {
    registrationId: string;
    devCode?: string;
  };
  expect(body.devCode).toMatch(/^\d{6}$/);

  return app.inject({
    method: "POST",
    url: "/auth/verify-phone",
    payload: {
      registrationId: body.registrationId,
      code: body.devCode,
    },
  });
}
