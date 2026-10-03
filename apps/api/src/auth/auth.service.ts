import { randomUUID } from "node:crypto";
import { Prisma, type User } from "@prisma/client";
import {
  authUserSchema,
  type AuthUser,
  type LoginBody,
  type RegisterBody,
} from "@classroom-tracker/shared";
import { prisma } from "../db.js";
import { hashPassword, verifyPassword } from "./password.js";

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
  });
}

export async function registerUser(input: RegisterBody): Promise<{
  user: AuthUser;
  accessToken: string;
  refreshToken: string;
}> {
  const passwordHash = await hashPassword(input.password);

  try {
    const user = await prisma.user.create({
      data: {
        name: input.name,
        email: input.email.toLowerCase(),
        passwordHash,
        role: "TEACHER",
      },
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
