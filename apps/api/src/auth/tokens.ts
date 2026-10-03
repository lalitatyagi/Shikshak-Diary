import { createHash, timingSafeEqual } from "node:crypto";
import { SignJWT, jwtVerify, type JWTPayload } from "jose";
import { roleSchema, type Role } from "@classroom-tracker/shared";

export const REFRESH_COOKIE_NAME = "refreshToken";

const ISSUER = "classroom-tracker";
const ACCESS_AUDIENCE = "classroom-tracker-access";
const REFRESH_AUDIENCE = "classroom-tracker-refresh";

export type AccessTokenPayload = {
  sub: string;
  email: string;
  role: Role;
};

export type RefreshTokenClaims = {
  sub: string;
  jti: string;
};

function requireSecret(name: string): Uint8Array {
  const value = process.env[name];
  if (!value || value.length < 32 || /^change-me/i.test(value)) {
    throw new Error(
      `${name} must be a random secret of at least 32 characters`,
    );
  }
  return new TextEncoder().encode(value);
}

function accessTtl(): string {
  return process.env.JWT_ACCESS_TTL ?? "15m";
}

function refreshTtl(): string {
  return process.env.JWT_REFRESH_TTL ?? "7d";
}

/** Seconds for `JWT_REFRESH_TTL` values such as `30s`, `15m`, `12h`, or `7d`. */
export function refreshTtlSeconds(): number {
  const match = /^(\d+)([smhd])$/.exec(refreshTtl().trim());
  if (!match) {
    throw new Error("JWT_REFRESH_TTL must look like 30s, 15m, 12h, or 7d");
  }
  const amount = Number(match[1]);
  const unit = match[2];
  const seconds =
    unit === "s"
      ? 1
      : unit === "m"
        ? 60
        : unit === "h"
          ? 60 * 60
          : 60 * 60 * 24;
  return amount * seconds;
}

export function hashRefreshToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function refreshTokenHashesMatch(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  if (a.length !== b.length) {
    return false;
  }
  return timingSafeEqual(a, b);
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
    .setIssuer(ISSUER)
    .setAudience(ACCESS_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(accessTtl())
    .sign(requireSecret("JWT_ACCESS_SECRET"));
}

export async function signRefreshToken(
  userId: string,
  jti: string,
): Promise<string> {
  return new SignJWT({ typ: "refresh" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setJti(jti)
    .setIssuer(ISSUER)
    .setAudience(REFRESH_AUDIENCE)
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
    {
      algorithms: ["HS256"],
      issuer: ISSUER,
      audience: ACCESS_AUDIENCE,
    },
  );
  return parseAccessPayload(payload);
}

export async function verifyRefreshToken(
  token: string,
): Promise<RefreshTokenClaims> {
  const { payload } = await jwtVerify(
    token,
    requireSecret("JWT_REFRESH_SECRET"),
    {
      algorithms: ["HS256"],
      issuer: ISSUER,
      audience: REFRESH_AUDIENCE,
    },
  );

  if (
    payload.typ !== "refresh" ||
    typeof payload.sub !== "string" ||
    typeof payload.jti !== "string"
  ) {
    throw new Error("Invalid refresh token");
  }

  return { sub: payload.sub, jti: payload.jti };
}

function parseAccessPayload(payload: JWTPayload): AccessTokenPayload {
  const role = roleSchema.safeParse(payload.role);
  if (
    typeof payload.sub !== "string" ||
    typeof payload.email !== "string" ||
    !role.success
  ) {
    throw new Error("Invalid access token payload");
  }

  return {
    sub: payload.sub,
    email: payload.email,
    role: role.data,
  };
}

export function refreshCookieOptions(): {
  httpOnly: boolean;
  path: string;
  sameSite: "lax";
  secure: boolean;
  maxAge: number;
} {
  return {
    httpOnly: true,
    path: "/auth",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: refreshTtlSeconds(),
  };
}
