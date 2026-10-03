import {
  bulkCompleteResultSchema,
  classGridSchema,
  taskStatusSchema,
  updateStatusBodySchema,
} from "@classroom-tracker/shared";
import type { FastifyInstance } from "fastify";
import { requireAuth, requireRole } from "../auth/auth.middleware.js";
import { sendHttpError } from "../errors.js";
import {
  getClassGrid,
  markAllComplete,
  updateTaskStatus,
} from "./status.service.js";

const teacherRoles = ["TEACHER", "CLASS_TEACHER", "ADMIN"] as const;

export async function statusRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    "/classes/:classId/grid",
    { preHandler: [requireAuth, requireRole(...teacherRoles)] },
    async (request, reply) => {
      const { classId } = request.params as { classId: string };
      try {
        const grid = await getClassGrid(
          classId,
          request.authUser!.id,
          request.authUser!.role,
        );
        return reply.send(classGridSchema.parse(grid));
      } catch (error) {
        return sendHttpError(reply, error);
      }
    },
  );

  app.put(
    "/task-statuses/:statusId",
    { preHandler: [requireAuth, requireRole(...teacherRoles)] },
    async (request, reply) => {
      const { statusId } = request.params as { statusId: string };
      const parsed = updateStatusBodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: "Invalid status payload",
          details: parsed.error.flatten(),
        });
      }

      try {
        const status = await updateTaskStatus(
          statusId,
          request.authUser!.id,
          request.authUser!.role,
          parsed.data.status,
          parsed.data.version,
        );
        return reply.send(taskStatusSchema.parse(status));
      } catch (error) {
        return sendHttpError(reply, error);
      }
    },
  );

  app.post(
    "/tasks/:taskId/mark-all-complete",
    { preHandler: [requireAuth, requireRole(...teacherRoles)] },
    async (request, reply) => {
      const { taskId } = request.params as { taskId: string };
      try {
        const result = await markAllComplete(
          taskId,
          request.authUser!.id,
          request.authUser!.role,
        );
        return reply.send(bulkCompleteResultSchema.parse(result));
      } catch (error) {
        return sendHttpError(reply, error);
      }
    },
  );
}
