import { describe, expect, it } from "vitest";
import {
  loginBodySchema,
  normalizeIndianPhone,
  registerBodySchema,
  authUserSchema,
  verifyPhoneBodySchema,
} from "./auth.js";

describe("normalizeIndianPhone", () => {
  it("accepts 10-digit and +91 forms", () => {
    expect(normalizeIndianPhone("9876543210")).toBe("+919876543210");
    expect(normalizeIndianPhone("+91 98765 43210")).toBe("+919876543210");
    expect(normalizeIndianPhone("09876543210")).toBe("+919876543210");
    expect(normalizeIndianPhone("12345")).toBeNull();
  });
});

describe("registerBodySchema", () => {
  it("accepts a valid registration payload with phone", () => {
    const result = registerBodySchema.safeParse({
      name: "Priya Sharma",
      email: "teacher@demo.local",
      password: "Teacher123!",
      phone: "9876543210",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.phone).toBe("+919876543210");
    }
  });

  it("rejects short passwords", () => {
    const result = registerBodySchema.safeParse({
      name: "Priya",
      email: "a@b.com",
      password: "short",
      phone: "9876543210",
    });
    expect(result.success).toBe(false);
  });
});

describe("verifyPhoneBodySchema", () => {
  it("requires a 6-digit code", () => {
    expect(
      verifyPhoneBodySchema.safeParse({
        registrationId: "abc",
        code: "123456",
      }).success,
    ).toBe(true);
    expect(
      verifyPhoneBodySchema.safeParse({
        registrationId: "abc",
        code: "12",
      }).success,
    ).toBe(false);
  });
});

describe("loginBodySchema", () => {
  it("rejects invalid email", () => {
    const result = loginBodySchema.safeParse({
      email: "not-an-email",
      password: "Teacher123!",
    });
    expect(result.success).toBe(false);
  });
});

describe("authUserSchema", () => {
  it("never includes passwordHash", () => {
    const parsed = authUserSchema.parse({
      id: "cuid",
      name: "Priya",
      email: "teacher@demo.local",
      role: "TEACHER",
      phone: null,
    });
    expect(parsed).not.toHaveProperty("passwordHash");
  });
});
