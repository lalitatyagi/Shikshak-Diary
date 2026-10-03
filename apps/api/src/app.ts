import {
  healthResponseSchema,
  type HealthResponse,
} from "@classroom-tracker/shared";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import Fastify, { type FastifyInstance } from "fastify";
import { authRoutes } from "./auth/auth.routes.js";
import { classRoutes } from "./classes/class.routes.js";
import { taskRoutes } from "./tasks/task.routes.js";

export async function buildApp(options?: {
  logger?: boolean;
}): Promise<FastifyInstance> {
  const app = Fastify({
    logger: options?.logger ?? true,
  });

  await app.register(cors, {
    origin: true,
    credentials: true,
  });

  await app.register(cookie);

  app.get("/health", async (): Promise<HealthResponse> => {
    const payload: HealthResponse = {
      status: "ok",
      service: "classroom-tracker-api",
      timestamp: new Date().toISOString(),
    };

    return healthResponseSchema.parse(payload);
  });

  await app.register(authRoutes);
  await app.register(classRoutes);
  await app.register(taskRoutes);

  return app;
}
