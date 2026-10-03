import { SignJWT } from "jose";
import { beforeAll, describe, expect, it } from "vitest";
import { loadEnv } from "../load-env.js";
import { hashPassword, verifyPassword } from "./password.js";
import {
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
} from "./tokens.js";

beforeAll(() => {
  loadEnv();
});

describe("password hashing", () => {
  it("hashes and verifies a password", async () => {
    const hash = await hashPassword("Teacher123!");
    expect(hash).not.toBe("Teacher123!");
    expect(await verifyPassword("Teacher123!", hash)).toBe(true);
    expect(await verifyPassword("wrong-password", hash)).toBe(false);
  });
});

describe("JWT tokens", () => {
  it("signs and verifies an access token with role claims", async () => {
    const token = await signAccessToken({
      sub: "user_1",
      email: "teacher@demo.local",
      role: "TEACHER",
    });

    const payload = await verifyAccessToken(token);
    expect(payload.sub).toBe("user_1");
    expect(payload.email).toBe("teacher@demo.local");
    expect(payload.role).toBe("TEACHER");
  });

  it("rejects a refresh token verified as an access token", async () => {
    const refresh = await signRefreshToken("user_1", "jti-1");
    await expect(verifyAccessToken(refresh)).rejects.toThrow();
  });

  it("rejects an access token verified as a refresh token", async () => {
    const access = await signAccessToken({
      sub: "user_1",
      email: "teacher@demo.local",
      role: "TEACHER",
    });
    await expect(verifyRefreshToken(access)).rejects.toThrow();
  });

  it("signs and verifies a refresh token subject", async () => {
    const refresh = await signRefreshToken("user_42", "jti-42");
    await expect(verifyRefreshToken(refresh)).resolves.toEqual({
      sub: "user_42",
      jti: "jti-42",
    });
  });

  it("rejects an access token whose role is not a known role", async () => {
    const token = await new SignJWT({
      email: "teacher@demo.local",
      role: "SUPERUSER",
    })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("user_1")
      .setIssuer("classroom-tracker")
      .setAudience("classroom-tracker-access")
      .setIssuedAt()
      .setExpirationTime("5m")
      .sign(new TextEncoder().encode(process.env.JWT_ACCESS_SECRET));

    await expect(verifyAccessToken(token)).rejects.toThrow();
  });

  it("rejects an access token signed with a different audience", async () => {
    const token = await new SignJWT({
      email: "teacher@demo.local",
      role: "TEACHER",
    })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("user_1")
      .setIssuer("classroom-tracker")
      .setAudience("some-other-api")
      .setIssuedAt()
      .setExpirationTime("5m")
      .sign(new TextEncoder().encode(process.env.JWT_ACCESS_SECRET));

    await expect(verifyAccessToken(token)).rejects.toThrow();
  });
});
