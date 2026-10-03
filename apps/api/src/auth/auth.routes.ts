import {
  authTokensSchema,
  authUserSchema,
  loginBodySchema,
  registerBodySchema,
} from "@classroom-tracker/shared";
import type { FastifyInstance, FastifyReply } from "fastify";
import {
  AuthError,
  getUserById,
  loginUser,
  refreshSession,
  registerUser,
} from "./auth.service.js";
import { requireAuth, requireRole } from "./auth.middleware.js";
import {
  REFRESH_COOKIE_NAME,
  refreshCookieOptions,
  verifyRefreshToken,
} from "./tokens.js";

function setRefreshCookie(reply: FastifyReply, refreshToken: string): void {
  reply.setCookie(REFRESH_COOKIE_NAME, refreshToken, refreshCookieOptions());
}

function clearRefreshCookie(reply: FastifyReply): void {
  reply.clearCookie(REFRESH_COOKIE_NAME, {
    path: refreshCookieOptions().path,
  });
}

function sendAuthError(reply: FastifyReply, error: unknown) {
  if (error instanceof AuthError) {
    return reply.status(error.statusCode).send({ error: error.message });
  }
  throw error;
}

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post("/auth/register", async (request, reply) => {
    const parsed = registerBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: "Invalid registration payload",
        details: parsed.error.flatten(),
      });
    }

    try {
      const session = await registerUser(parsed.data);
      setRefreshCookie(reply, session.refreshToken);
      return reply.status(201).send(
        authTokensSchema.parse({
          accessToken: session.accessToken,
          user: session.user,
        }),
      );
    } catch (error) {
      return sendAuthError(reply, error);
    }
  });

  app.post("/auth/login", async (request, reply) => {
    const parsed = loginBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: "Invalid login payload",
        details: parsed.error.flatten(),
      });
    }

    try {
      const session = await loginUser(parsed.data);
      setRefreshCookie(reply, session.refreshToken);
      return reply.send(
        authTokensSchema.parse({
          accessToken: session.accessToken,
          user: session.user,
        }),
      );
    } catch (error) {
      return sendAuthError(reply, error);
    }
  });

  app.post("/auth/logout", async (_request, reply) => {
    clearRefreshCookie(reply);
    return reply.status(204).send();
  });

  app.post("/auth/refresh", async (request, reply) => {
    const token = request.cookies[REFRESH_COOKIE_NAME];
    if (!token) {
      return reply.status(401).send({ error: "Missing refresh token" });
    }

    try {
      const userId = await verifyRefreshToken(token);
      const session = await refreshSession(userId);
      setRefreshCookie(reply, session.refreshToken);
      return reply.send(
        authTokensSchema.parse({
          accessToken: session.accessToken,
          user: session.user,
        }),
      );
    } catch {
      clearRefreshCookie(reply);
      return reply
        .status(401)
        .send({ error: "Invalid or expired refresh token" });
    }
  });

  app.get("/auth/me", { preHandler: [requireAuth] }, async (request, reply) => {
    try {
      const user = await getUserById(request.authUser!.id);
      return reply.send(authUserSchema.parse(user));
    } catch (error) {
      return sendAuthError(reply, error);
    }
  });

  // Smoke route to prove role middleware — teachers and class teachers only.
  app.get(
    "/auth/teacher-check",
    {
      preHandler: [requireAuth, requireRole("TEACHER", "CLASS_TEACHER")],
    },
    async (request, reply) => {
      return reply.send({
        ok: true,
        role: request.authUser!.role,
      });
    },
  );
}
