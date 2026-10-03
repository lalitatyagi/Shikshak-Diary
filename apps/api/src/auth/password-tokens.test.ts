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
    const refresh = await signRefreshToken("user_1");
    await expect(verifyAccessToken(refresh)).rejects.toThrow();
  });

  it("signs and verifies a refresh token subject", async () => {
    const refresh = await signRefreshToken("user_42");
    await expect(verifyRefreshToken(refresh)).resolves.toBe("user_42");
  });
});
