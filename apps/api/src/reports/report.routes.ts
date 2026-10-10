import {
  studentReportQuerySchema,
  studentReportSchema,
} from "@classroom-tracker/shared";
import type { FastifyInstance } from "fastify";
import {
  requireAuth,
  requireRole,
  teacherRoles,
} from "../auth/auth.middleware.js";
import { sendHttpError } from "../errors.js";
import { getStudentReport } from "./report.service.js";

export async function reportRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    "/classes/:classId/students/:studentId/report",
    { preHandler: [requireAuth, requireRole(...teacherRoles)] },
    async (request, reply) => {
      const { classId, studentId } = request.params as {
        classId: string;
        studentId: string;
      };
      const parsed = studentReportQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        return reply.status(400).send({
          error: "Invalid report query",
          details: parsed.error.flatten(),
        });
      }

      try {
        const report = await getStudentReport(
          classId,
          studentId,
          request.authUser!.id,
          request.authUser!.role,
          parsed.data.days,
        );
        return reply.send(studentReportSchema.parse(report));
      } catch (error) {
        return sendHttpError(reply, error);
      }
    },
  );
}
