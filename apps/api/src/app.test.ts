import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "./app.js";
import { loadEnv } from "./load-env.js";

loadEnv();

describe("GET /health", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp({ logger: false });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("returns ok with service name and timestamp", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/health",
    });

    expect(response.statusCode).toBe(200);

    const body = response.json() as {
      status: string;
      service: string;
      timestamp: string;
    };

    expect(body.status).toBe("ok");
    expect(body.service).toBe("classroom-tracker-api");
    expect(Number.isNaN(Date.parse(body.timestamp))).toBe(false);
    expect(response.headers["x-content-type-options"]).toBe("nosniff");
  });

  it("allows only configured browser origins", async () => {
    const allowed = await app.inject({
      method: "GET",
      url: "/health",
      headers: { origin: "http://localhost:5173" },
    });
    expect(allowed.headers["access-control-allow-origin"]).toBe(
      "http://localhost:5173",
    );

    const blocked = await app.inject({
      method: "GET",
      url: "/health",
      headers: { origin: "https://evil.example" },
    });
    expect(blocked.headers["access-control-allow-origin"]).not.toBe(
      "https://evil.example",
    );
  });
});

describe("login rate limit", () => {
  it("returns 429 after the auth attempt budget is used", async () => {
    const previous = process.env.AUTH_RATE_LIMIT_MAX;
    process.env.AUTH_RATE_LIMIT_MAX = "2";
    const limited = await buildApp({ logger: false });
    try {
      const attempt = () =>
        limited.inject({
          method: "POST",
          url: "/auth/login",
          payload: {
            email: "nobody@demo.local",
            password: "Password123!",
          },
        });

      expect((await attempt()).statusCode).toBe(401);
      expect((await attempt()).statusCode).toBe(401);
      expect((await attempt()).statusCode).toBe(429);
    } finally {
      await limited.close();
      if (previous === undefined) {
        delete process.env.AUTH_RATE_LIMIT_MAX;
      } else {
        process.env.AUTH_RATE_LIMIT_MAX = previous;
      }
    }
  });
});
