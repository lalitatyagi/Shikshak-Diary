import { SignJWT, jwtVerify, type JWTPayload } from "jose";
import type { Role } from "@classroom-tracker/shared";

export const REFRESH_COOKIE_NAME = "refreshToken";

export type AccessTokenPayload = {
  sub: string;
  email: string;
  role: Role;
};

type RefreshTokenPayload = {
  sub: string;
  typ: "refresh";
};

function requireSecret(name: string): Uint8Array {
  const value = process.env[name];
  if (!value || value.length < 32) {
    throw new Error(`${name} must be set (min 32 characters)`);
  }
  return new TextEncoder().encode(value);
}

function accessTtl(): string {
  return process.env.JWT_ACCESS_TTL ?? "15m";
}

function refreshTtl(): string {
  return process.env.JWT_REFRESH_TTL ?? "7d";
}

export async function signAccessToken(
  payload: AccessTokenPayload,
): Promise<string> {
  return new SignJWT({
    email: payload.email,
    role: payload.role,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime(accessTtl())
    .sign(requireSecret("JWT_ACCESS_SECRET"));
}

export async function signRefreshToken(userId: string): Promise<string> {
  return new SignJWT({ typ: "refresh" satisfies RefreshTokenPayload["typ"] })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(refreshTtl())
    .sign(requireSecret("JWT_REFRESH_SECRET"));
}

export async function verifyAccessToken(
  token: string,
): Promise<AccessTokenPayload> {
  const { payload } = await jwtVerify(
    token,
    requireSecret("JWT_ACCESS_SECRET"),
  );
  return parseAccessPayload(payload);
}

export async function verifyRefreshToken(token: string): Promise<string> {
  const { payload } = await jwtVerify(
    token,
    requireSecret("JWT_REFRESH_SECRET"),
  );

  if (payload.typ !== "refresh" || typeof payload.sub !== "string") {
    throw new Error("Invalid refresh token");
  }

  return payload.sub;
}

function parseAccessPayload(payload: JWTPayload): AccessTokenPayload {
  const role = payload.role;
  if (
    typeof payload.sub !== "string" ||
    typeof payload.email !== "string" ||
    typeof role !== "string"
  ) {
    throw new Error("Invalid access token payload");
  }

  return {
    sub: payload.sub,
    email: payload.email,
    role: role as Role,
  };
}

export function refreshCookieOptions(): {
  httpOnly: boolean;
  path: string;
  sameSite: "lax";
  secure: boolean;
  maxAge: number;
} {
  const sevenDaysSeconds = 60 * 60 * 24 * 7;
  return {
    httpOnly: true,
    path: "/auth",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: sevenDaysSeconds,
  };
}
