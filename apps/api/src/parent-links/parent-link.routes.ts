import {
  createParentLinkBodySchema,
  parentLinkCreatedSchema,
  parentLinkStatusSchema,
  studentReportCsvFilename,
  studentReportQuerySchema,
  studentReportSchema,
  studentReportToCsv,
} from "@classroom-tracker/shared";
import type { FastifyInstance } from "fastify";
import {
  requireAuth,
  requireRole,
  teacherRoles,
} from "../auth/auth.middleware.js";
import { sendHttpError } from "../errors.js";
import { sendCsvAttachment } from "../exports/csv-response.js";
import {
  createOrRotateParentLink,
  getParentLinkStatus,
  getReportByParentToken,
  revokeParentLink,
} from "./parent-link.service.js";

export async function parentLinkRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    "/classes/:classId/students/:studentId/parent-link",
    { preHandler: [requireAuth, requireRole(...teacherRoles)] },
    async (request, reply) => {
      const { classId, studentId } = request.params as {
        classId: string;
        studentId: string;
      };
      try {
        const status = await getParentLinkStatus(
          classId,
          studentId,
          request.authUser!.id,
          request.authUser!.role,
        );
        return reply.send(parentLinkStatusSchema.parse(status));
      } catch (error) {
        return sendHttpError(reply, error);
      }
    },
  );

  app.post(
    "/classes/:classId/students/:studentId/parent-link",
    { preHandler: [requireAuth, requireRole(...teacherRoles)] },
    async (request, reply) => {
      const { classId, studentId } = request.params as {
        classId: string;
        studentId: string;
      };
      const parsed = createParentLinkBodySchema.safeParse(request.body ?? {});
      if (!parsed.success) {
        return reply.status(400).send({
          error: "Invalid parent link payload",
          details: parsed.error.flatten(),
        });
      }

      try {
        const created = await createOrRotateParentLink(
          classId,
          studentId,
          request.authUser!.id,
          request.authUser!.role,
          parsed.data.expiresInDays,
        );
        return reply
          .status(201)
          .send(parentLinkCreatedSchema.parse(created));
      } catch (error) {
        return sendHttpError(reply, error);
      }
    },
  );

  app.delete(
    "/classes/:classId/students/:studentId/parent-link",
    { preHandler: [requireAuth, requireRole(...teacherRoles)] },
    async (request, reply) => {
      const { classId, studentId } = request.params as {
        classId: string;
        studentId: string;
      };
      try {
        const status = await revokeParentLink(
          classId,
          studentId,
          request.authUser!.id,
          request.authUser!.role,
        );
        return reply.send(parentLinkStatusSchema.parse(status));
      } catch (error) {
        return sendHttpError(reply, error);
      }
    },
  );

  app.get(
    "/parent/:token/report",
    {
      config: {
        rateLimit: {
          max: 60,
          timeWindow: "1 minute",
        },
      },
    },
    async (request, reply) => {
      const { token } = request.params as { token: string };
      const parsed = studentReportQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        return reply.status(400).send({
          error: "Invalid report query",
          details: parsed.error.flatten(),
        });
      }

      try {
        const report = await getReportByParentToken(token, parsed.data.days);
        return reply.send(studentReportSchema.parse(report));
      } catch (error) {
        return sendHttpError(reply, error);
      }
    },
  );

  app.get(
    "/parent/:token/report.csv",
    {
      config: {
        rateLimit: {
          max: 60,
          timeWindow: "1 minute",
        },
      },
    },
    async (request, reply) => {
      const { token } = request.params as { token: string };
      const parsed = studentReportQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        return reply.status(400).send({
          error: "Invalid report query",
          details: parsed.error.flatten(),
        });
      }

      try {
        const report = await getReportByParentToken(token, parsed.data.days);
        return sendCsvAttachment(
          reply,
          studentReportCsvFilename(report),
          studentReportToCsv(report),
        );
      } catch (error) {
        return sendHttpError(reply, error);
      }
    },
  );
}
