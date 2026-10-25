import { homeResponseSchema } from "@classroom-tracker/shared";
import type { FastifyInstance } from "fastify";
import {
  requireAuth,
  requireRole,
  teacherRoles,
} from "../auth/auth.middleware.js";
import { getTeacherHome } from "./home.service.js";

export async function homeRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    "/home",
    {
      preHandler: [requireAuth, requireRole(...teacherRoles)],
    },
    async (request, reply) => {
      const user = request.authUser!;
      const home = await getTeacherHome(user.id, user.role);
      return reply.send(homeResponseSchema.parse(home));
    },
  );
}
