import {
  healthResponseSchema,
  type HealthResponse,
} from "@classroom-tracker/shared";
import Fastify, { type FastifyInstance } from "fastify";

export function buildApp(options?: { logger?: boolean }): FastifyInstance {
  const app = Fastify({
    logger: options?.logger ?? true,
  });

  app.get("/health", async (): Promise<HealthResponse> => {
    const payload: HealthResponse = {
      status: "ok",
      service: "classroom-tracker-api",
      timestamp: new Date().toISOString(),
    };

    return healthResponseSchema.parse(payload);
  });

  return app;
}
