import { afterEach, describe, expect, it } from "vitest";
import { loadEnv } from "./load-env.js";

describe("loadEnv", () => {
  const previous = process.env.DATABASE_URL;

  afterEach(() => {
    if (previous === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = previous;
    }
  });

  it("does not replace variables that are already set", () => {
    process.env.DATABASE_URL = "postgresql://sentinel.example/db";
    loadEnv();
    expect(process.env.DATABASE_URL).toBe("postgresql://sentinel.example/db");
  });
});
