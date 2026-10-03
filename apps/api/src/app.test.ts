import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "./app.js";

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
  });
});
