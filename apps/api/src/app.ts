import {
  healthResponseSchema,
  type HealthResponse,
} from "@classroom-tracker/shared";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import Fastify, { type FastifyInstance } from "fastify";
import { authRoutes } from "./auth/auth.routes.js";
import { classRoutes } from "./classes/class.routes.js";
import { defaultersRoutes } from "./defaulters/defaulters.routes.js";
import { taskRoutes } from "./tasks/task.routes.js";
import { statusRoutes } from "./tasks/status.routes.js";

function allowedOrigins(): string[] {
  const raw = process.env.CORS_ORIGINS ?? "http://localhost:5173";
  return raw
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
}

export async function buildApp(options?: {
  logger?: boolean;
}): Promise<FastifyInstance> {
  const app = Fastify({
    logger: options?.logger ?? true,
  });

  await app.register(helmet);
  await app.register(rateLimit, {
    global: true,
    max: 300,
    timeWindow: "1 minute",
  });
  await app.register(cors, {
    origin: allowedOrigins(),
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
  await app.register(statusRoutes);
  await app.register(defaultersRoutes);

  return app;
}
