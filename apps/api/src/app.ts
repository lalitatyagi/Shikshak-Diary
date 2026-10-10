import {
  healthResponseSchema,
  type HealthResponse,
} from "@classroom-tracker/shared";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import Fastify, { type FastifyInstance } from "fastify";
import { AuthError } from "./auth/auth.service.js";
import { authRoutes } from "./auth/auth.routes.js";
import { classRoutes } from "./classes/class.routes.js";
import { prisma } from "./db.js";
import { defaultersRoutes } from "./defaulters/defaulters.routes.js";
import { HttpError } from "./errors.js";
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

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof HttpError || error instanceof AuthError) {
      return reply.status(error.statusCode).send({ error: error.message });
    }
    const statusCode =
      typeof error === "object" &&
      error &&
      "statusCode" in error &&
      typeof error.statusCode === "number"
        ? error.statusCode
        : 500;
    if (statusCode >= 500) {
      request.log.error(error);
      return reply.status(500).send({ error: "Internal server error" });
    }
    return reply.status(statusCode).send({
      error: error instanceof Error ? error.message : "Request failed",
    });
  });

  app.get("/health", async (request, reply) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
    } catch (error) {
      request.log.error(error);
      return reply.status(503).send({ error: "Database unavailable" });
    }

    const payload: HealthResponse = {
      status: "ok",
      service: "classroom-tracker-api",
      timestamp: new Date().toISOString(),
    };

    return reply.send(healthResponseSchema.parse(payload));
  });

  await app.register(authRoutes);
  await app.register(classRoutes);
  await app.register(taskRoutes);
  await app.register(statusRoutes);
  await app.register(defaultersRoutes);

  return app;
}
