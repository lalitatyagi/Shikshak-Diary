import { describe, expect, it } from "vitest";
import { loginBodySchema, registerBodySchema, authUserSchema } from "./auth.js";

describe("registerBodySchema", () => {
  it("accepts a valid registration payload", () => {
    const result = registerBodySchema.safeParse({
      name: "Priya Sharma",
      email: "teacher@demo.local",
      password: "Teacher123!",
    });
    expect(result.success).toBe(true);
  });

  it("rejects short passwords", () => {
    const result = registerBodySchema.safeParse({
      name: "Priya",
      email: "a@b.com",
      password: "short",
    });
    expect(result.success).toBe(false);
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
    });
    expect(parsed).not.toHaveProperty("passwordHash");
  });
});
