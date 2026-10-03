import { createTaskBodySchema, taskSchema } from "@classroom-tracker/shared";
import type { FastifyInstance } from "fastify";
import { requireAuth, requireRole } from "../auth/auth.middleware.js";
import { sendHttpError } from "../errors.js";
import {
  createTaskForClass,
  getTaskById,
  listTasksForClass,
} from "./task.service.js";

const teacherRoles = ["TEACHER", "CLASS_TEACHER", "ADMIN"] as const;

export async function taskRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    "/classes/:classId/tasks",
    { preHandler: [requireAuth, requireRole(...teacherRoles)] },
    async (request, reply) => {
      const { classId } = request.params as { classId: string };
      const parsed = createTaskBodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: "Invalid task payload",
          details: parsed.error.flatten(),
        });
      }

      try {
        const task = await createTaskForClass(
          classId,
          request.authUser!.id,
          request.authUser!.role,
          parsed.data,
        );
        return reply.status(201).send(taskSchema.parse(task));
      } catch (error) {
        return sendHttpError(reply, error);
      }
    },
  );

  app.get(
    "/classes/:classId/tasks",
    { preHandler: [requireAuth, requireRole(...teacherRoles)] },
    async (request, reply) => {
      const { classId } = request.params as { classId: string };
      try {
        const tasks = await listTasksForClass(
          classId,
          request.authUser!.id,
          request.authUser!.role,
        );
        return reply.send(tasks.map((task) => taskSchema.parse(task)));
      } catch (error) {
        return sendHttpError(reply, error);
      }
    },
  );

  app.get(
    "/tasks/:taskId",
    { preHandler: [requireAuth, requireRole(...teacherRoles)] },
    async (request, reply) => {
      const { taskId } = request.params as { taskId: string };
      try {
        const task = await getTaskById(
          taskId,
          request.authUser!.id,
          request.authUser!.role,
        );
        return reply.send(taskSchema.parse(task));
      } catch (error) {
        return sendHttpError(reply, error);
      }
    },
  );
}
