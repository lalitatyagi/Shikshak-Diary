import type { Role } from "@classroom-tracker/shared";
import type {
  FastifyReply,
  FastifyRequest,
  preHandlerHookHandler,
} from "fastify";
import { prisma } from "../db.js";
import { verifyAccessToken } from "./tokens.js";

/** Claims available after requireAuth (from the access JWT). */
export type RequestUser = {
  id: string;
  email: string;
  role: Role;
};

declare module "fastify" {
  interface FastifyRequest {
    authUser?: RequestUser;
  }
}

function readBearerToken(request: FastifyRequest): string | null {
  const header = request.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return null;
  }
  const token = header.slice("Bearer ".length).trim();
  return token.length > 0 ? token : null;
}

export const requireAuth: preHandlerHookHandler = async (
  request: FastifyRequest,
  reply: FastifyReply,
) => {
  const token = readBearerToken(request);
  if (!token) {
    return reply.status(401).send({ error: "Missing access token" });
  }

  try {
    const payload = await verifyAccessToken(token);
    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, role: true },
    });
    if (!user) {
      return reply.status(401).send({ error: "Session is no longer valid" });
    }
    request.authUser = {
      id: user.id,
      email: user.email,
      role: user.role,
    };
  } catch {
    return reply.status(401).send({ error: "Invalid or expired access token" });
  }
};

/** Roles that teach or administer a class. */
export const teacherRoles = ["TEACHER", "CLASS_TEACHER", "ADMIN"] as const;

/** Use after requireAuth. */
export function requireRole(...allowed: Role[]): preHandlerHookHandler {
  return async (request, reply) => {
    if (!request.authUser) {
      return reply.status(401).send({ error: "Unauthorized" });
    }

    if (!allowed.includes(request.authUser.role)) {
      return reply.status(403).send({ error: "Forbidden for this role" });
    }
  };
}
