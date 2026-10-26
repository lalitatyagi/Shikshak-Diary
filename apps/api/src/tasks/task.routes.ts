import {
  createRecurringTasksBodySchema,
  createRecurringTasksResultSchema,
  createTaskBodySchema,
  paginatedResponseSchema,
  taskSchema,
  tasksListQuerySchema,
  todayHomeworkBodySchema,
  todayHomeworkResultSchema,
} from "@classroom-tracker/shared";
import type { FastifyInstance } from "fastify";
import {
  requireAuth,
  requireRole,
  teacherRoles,
} from "../auth/auth.middleware.js";
import { sendHttpError } from "../errors.js";
import {
  createRecurringTasksForClass,
  createTaskForClass,
  createTodaysDailyHomework,
  getTaskById,
  listTasksForClass,
} from "./task.service.js";

const paginatedTasksSchema = paginatedResponseSchema(taskSchema);

export async function taskRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    "/classes/:classId/tasks/recurring",
    { preHandler: [requireAuth, requireRole(...teacherRoles)] },
    async (request, reply) => {
      const { classId } = request.params as { classId: string };
      const parsed = createRecurringTasksBodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: "Invalid recurring task payload",
          details: parsed.error.flatten(),
        });
      }

      try {
        const result = await createRecurringTasksForClass(
          classId,
          request.authUser!.id,
          request.authUser!.role,
          parsed.data,
        );
        const body = createRecurringTasksResultSchema.parse(result);
        const status =
          body.created.length > 0
            ? 201
            : body.skippedDates.length > 0
              ? 200
              : 400;
        return reply.status(status).send(body);
      } catch (error) {
        return sendHttpError(reply, error);
      }
    },
  );

  app.post(
    "/classes/:classId/tasks/today-homework",
    { preHandler: [requireAuth, requireRole(...teacherRoles)] },
    async (request, reply) => {
      const { classId } = request.params as { classId: string };
      const parsed = todayHomeworkBodySchema.safeParse(request.body ?? {});
      if (!parsed.success) {
        return reply.status(400).send({
          error: "Invalid today-homework payload",
          details: parsed.error.flatten(),
        });
      }

      try {
        const result = await createTodaysDailyHomework(
          classId,
          request.authUser!.id,
          request.authUser!.role,
          parsed.data,
        );
        const body = todayHomeworkResultSchema.parse(result);
        return reply.status(result.created ? 201 : 200).send(body);
      } catch (error) {
        return sendHttpError(reply, error);
      }
    },
  );

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
      const parsed = tasksListQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        return reply.status(400).send({
          error: "Invalid tasks query",
          details: parsed.error.flatten(),
        });
      }
      try {
        const result = await listTasksForClass(
          classId,
          request.authUser!.id,
          request.authUser!.role,
          parsed.data,
        );
        return reply.send(paginatedTasksSchema.parse(result));
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
