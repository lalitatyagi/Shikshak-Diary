import {
  defaultersCsvFilename,
  defaultersQuerySchema,
  defaultersResponseSchema,
  defaultersToCsv,
} from "@classroom-tracker/shared";
import type { FastifyInstance } from "fastify";
import {
  requireAuth,
  requireRole,
  teacherRoles,
} from "../auth/auth.middleware.js";
import { sendHttpError } from "../errors.js";
import { sendCsvAttachment } from "../exports/csv-response.js";
import { listDefaulters } from "./defaulters.service.js";

export async function defaultersRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    "/classes/:classId/defaulters",
    { preHandler: [requireAuth, requireRole(...teacherRoles)] },
    async (request, reply) => {
      const { classId } = request.params as { classId: string };
      const parsed = defaultersQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        return reply.status(400).send({
          error: "Invalid defaulters query",
          details: parsed.error.flatten(),
        });
      }

      try {
        const result = await listDefaulters(
          classId,
          request.authUser!.id,
          request.authUser!.role,
          parsed.data.days,
        );
        return reply.send(defaultersResponseSchema.parse(result));
      } catch (error) {
        return sendHttpError(reply, error);
      }
    },
  );

  app.get(
    "/classes/:classId/defaulters.csv",
    { preHandler: [requireAuth, requireRole(...teacherRoles)] },
    async (request, reply) => {
      const { classId } = request.params as { classId: string };
      const parsed = defaultersQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        return reply.status(400).send({
          error: "Invalid defaulters query",
          details: parsed.error.flatten(),
        });
      }

      try {
        const result = await listDefaulters(
          classId,
          request.authUser!.id,
          request.authUser!.role,
          parsed.data.days,
        );
        return sendCsvAttachment(
          reply,
          defaultersCsvFilename(result),
          defaultersToCsv(result),
        );
      } catch (error) {
        return sendHttpError(reply, error);
      }
    },
  );
}
