import { randomUUID } from "node:crypto";
import { Prisma, type User } from "@prisma/client";
import {
  authUserSchema,
  maskPhone,
  type AuthUser,
  type LoginBody,
  type RegisterBody,
  type RegisterPending,
} from "@classroom-tracker/shared";
import { prisma } from "../db.js";
import { hashPassword, verifyPassword } from "./password.js";
import {
  generateOtpCode,
  hashOtpCode,
  otpCodesMatch,
  otpMaxAttempts,
  otpTtlMs,
} from "./otp.js";
import { sendOtpSms, smsOtpMode } from "./sms.js";

/** Precomputed bcrypt hash so unknown emails take the same time as real ones. */
const DUMMY_PASSWORD_HASH =
  "$2a$12$CZJVLAOMQxFeMYiaA1Q5Ku3JQi.6mF3/PSjMqNW7EbtxzEPXbqa3a";
import {
  hashRefreshToken,
  refreshTokenHashesMatch,
  refreshTtlSeconds,
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from "./tokens.js";

const REGISTER_PURPOSE = "REGISTER";

export class AuthError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
  ) {
    super(message);
    this.name = "AuthError";
  }
}

function toAuthUser(user: User): AuthUser {
  return authUserSchema.parse({
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    phone: user.phone,
  });
}

/**
 * Starts sign-up: stores a pending PhoneOtp and sends SMS.
 * Does not create a User or session until verifyPhoneRegistration succeeds.
 */
export async function startPhoneRegistration(
  input: RegisterBody,
): Promise<RegisterPending> {
  const email = input.email.toLowerCase();
  const phone = input.phone;

  const existingEmail = await prisma.user.findUnique({ where: { email } });
  if (existingEmail) {
    throw new AuthError("Unable to register", 400);
  }

  const existingPhone = await prisma.user.findUnique({ where: { phone } });
  if (existingPhone) {
    throw new AuthError("Unable to register", 400);
  }

  const passwordHash = await hashPassword(input.password);
  const code = generateOtpCode();
  const codeHash = hashOtpCode(code);

  await prisma.phoneOtp.deleteMany({
    where: {
      OR: [{ pendingEmail: email }, { phone, purpose: REGISTER_PURPOSE }],
    },
  });

  const row = await prisma.phoneOtp.create({
    data: {
      phone,
      purpose: REGISTER_PURPOSE,
      codeHash,
      expiresAt: new Date(Date.now() + otpTtlMs()),
      pendingName: input.name,
      pendingEmail: email,
      pendingPasswordHash: passwordHash,
    },
  });

  try {
    await sendOtpSms(phone, code);
  } catch (error) {
    await prisma.phoneOtp.delete({ where: { id: row.id } }).catch(() => {});
    throw new AuthError(
      error instanceof Error ? error.message : "Failed to send OTP",
      502,
    );
  }

  const pending: RegisterPending = {
    status: "otp_sent",
    registrationId: row.id,
    phone: maskPhone(phone),
  };
  if (smsOtpMode() === "log") {
    pending.devCode = code;
  }
  return pending;
}

export async function resendPhoneRegistrationOtp(
  registrationId: string,
): Promise<RegisterPending> {
  const row = await prisma.phoneOtp.findUnique({
    where: { id: registrationId },
  });
  if (!row || row.purpose !== REGISTER_PURPOSE) {
    throw new AuthError("Registration not found or expired", 404);
  }

  const code = generateOtpCode();
  const updated = await prisma.phoneOtp.update({
    where: { id: row.id },
    data: {
      codeHash: hashOtpCode(code),
      expiresAt: new Date(Date.now() + otpTtlMs()),
      attempts: 0,
    },
  });

  try {
    await sendOtpSms(updated.phone, code);
  } catch (error) {
    throw new AuthError(
      error instanceof Error ? error.message : "Failed to send OTP",
      502,
    );
  }

  const pending: RegisterPending = {
    status: "otp_sent",
    registrationId: updated.id,
    phone: maskPhone(updated.phone),
  };
  if (smsOtpMode() === "log") {
    pending.devCode = code;
  }
  return pending;
}

export async function verifyPhoneRegistration(
  registrationId: string,
  code: string,
): Promise<{
  user: AuthUser;
  accessToken: string;
  refreshToken: string;
}> {
  const row = await prisma.phoneOtp.findUnique({
    where: { id: registrationId },
  });
  if (!row || row.purpose !== REGISTER_PURPOSE) {
    throw new AuthError("Registration not found or expired", 404);
  }

  if (row.expiresAt.getTime() <= Date.now()) {
    await prisma.phoneOtp.delete({ where: { id: row.id } }).catch(() => {});
    throw new AuthError("OTP expired. Request a new code.", 400);
  }

  if (row.attempts >= otpMaxAttempts()) {
    await prisma.phoneOtp.delete({ where: { id: row.id } }).catch(() => {});
    throw new AuthError("Too many attempts. Start sign-up again.", 400);
  }

  if (!otpCodesMatch(row.codeHash, code)) {
    await prisma.phoneOtp.update({
      where: { id: row.id },
      data: { attempts: { increment: 1 } },
    });
    throw new AuthError("Invalid code", 400);
  }

  try {
    const user = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          name: row.pendingName,
          email: row.pendingEmail,
          passwordHash: row.pendingPasswordHash,
          role: "TEACHER",
          phone: row.phone,
          phoneVerifiedAt: new Date(),
        },
      });
      await tx.phoneOtp.delete({ where: { id: row.id } });
      return created;
    });

    return issueSession(user);
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      throw new AuthError("Unable to register", 400);
    }
    throw error;
  }
}

export async function loginUser(input: LoginBody): Promise<{
  user: AuthUser;
  accessToken: string;
  refreshToken: string;
}> {
  const user = await prisma.user.findUnique({
    where: { email: input.email.toLowerCase() },
  });

  if (!user) {
    await verifyPassword(input.password, DUMMY_PASSWORD_HASH);
    throw new AuthError("Invalid email or password", 401);
  }

  const valid = await verifyPassword(input.password, user.passwordHash);
  if (!valid) {
    throw new AuthError("Invalid email or password", 401);
  }

  return issueSession(user);
}

export async function rotateRefreshSession(rawToken: string): Promise<{
  user: AuthUser;
  accessToken: string;
  refreshToken: string;
}> {
  const claims = await verifyRefreshToken(rawToken);
  const presentedHash = hashRefreshToken(rawToken);

  return prisma.$transaction(async (tx) => {
    const row = await tx.refreshToken.findUnique({
      where: { id: claims.jti },
    });

    const expired = row ? row.expiresAt.getTime() <= Date.now() : false;
    const hashOk = row
      ? refreshTokenHashesMatch(row.tokenHash, presentedHash)
      : false;

    if (
      !row ||
      row.revokedAt ||
      expired ||
      !hashOk ||
      row.userId !== claims.sub
    ) {
      throw new AuthError("Invalid or expired refresh token", 401);
    }

    const user = await tx.user.findUnique({ where: { id: row.userId } });
    if (!user) {
      throw new AuthError("Session is no longer valid", 401);
    }

    await tx.refreshToken.update({
      where: { id: row.id },
      data: { revokedAt: new Date() },
    });

    return issueSession(user, tx);
  });
}

/** Revokes the presented refresh token. Unknown tokens are ignored. */
export async function revokeRefreshToken(rawToken: string): Promise<void> {
  let claims: { jti: string };
  try {
    claims = await verifyRefreshToken(rawToken);
  } catch {
    return;
  }

  await prisma.refreshToken.updateMany({
    where: { id: claims.jti, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function getUserById(userId: string): Promise<AuthUser> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    throw new AuthError("User not found", 404);
  }
  return toAuthUser(user);
}

async function issueSession(
  user: User,
  tx: Prisma.TransactionClient | typeof prisma = prisma,
): Promise<{
  user: AuthUser;
  accessToken: string;
  refreshToken: string;
}> {
  const authUser = toAuthUser(user);
  const jti = randomUUID();
  const accessToken = await signAccessToken({
    sub: user.id,
    email: user.email,
    role: user.role,
  });
  const refreshToken = await signRefreshToken(user.id, jti);

  await tx.refreshToken.create({
    data: {
      id: jti,
      userId: user.id,
      tokenHash: hashRefreshToken(refreshToken),
      expiresAt: new Date(Date.now() + refreshTtlSeconds() * 1000),
    },
  });

  return { user: authUser, accessToken, refreshToken };
}
