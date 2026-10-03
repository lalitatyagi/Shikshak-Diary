import {
  classSchema,
  createClassBodySchema,
  csvImportBodySchema,
  csvImportResultSchema,
  schoolSchema,
  studentSchema,
} from "@classroom-tracker/shared";
import type { FastifyInstance } from "fastify";
import { requireAuth, requireRole } from "../auth/auth.middleware.js";
import { sendHttpError } from "../errors.js";
import {
  createClassForTeacher,
  importStudentsFromCsv,
  listClassesForUser,
  listSchools,
  listStudentsForClass,
} from "./class.service.js";

const teacherRoles = ["TEACHER", "CLASS_TEACHER", "ADMIN"] as const;

export async function classRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    "/schools",
    { preHandler: [requireAuth, requireRole(...teacherRoles)] },
    async (_request, reply) => {
      const schools = await listSchools();
      return reply.send(schools.map((school) => schoolSchema.parse(school)));
    },
  );

  app.get(
    "/classes",
    { preHandler: [requireAuth, requireRole(...teacherRoles)] },
    async (request, reply) => {
      const user = request.authUser!;
      const classes = await listClassesForUser(user.id, user.role);
      return reply.send(classes.map((item) => classSchema.parse(item)));
    },
  );

  app.post(
    "/classes",
    { preHandler: [requireAuth, requireRole(...teacherRoles)] },
    async (request, reply) => {
      const parsed = createClassBodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: "Invalid class payload",
          details: parsed.error.flatten(),
        });
      }

      try {
        const classroom = await createClassForTeacher(
          request.authUser!.id,
          parsed.data,
        );
        return reply.status(201).send(classSchema.parse(classroom));
      } catch (error) {
        return sendHttpError(reply, error);
      }
    },
  );

  app.get(
    "/classes/:classId/students",
    { preHandler: [requireAuth, requireRole(...teacherRoles)] },
    async (request, reply) => {
      const { classId } = request.params as { classId: string };
      try {
        const students = await listStudentsForClass(
          classId,
          request.authUser!.id,
          request.authUser!.role,
        );
        return reply.send(
          students.map((student) => studentSchema.parse(student)),
        );
      } catch (error) {
        return sendHttpError(reply, error);
      }
    },
  );

  app.post(
    "/classes/:classId/students/import",
    { preHandler: [requireAuth, requireRole(...teacherRoles)] },
    async (request, reply) => {
      const { classId } = request.params as { classId: string };
      const parsed = csvImportBodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: "Invalid import payload",
          details: parsed.error.flatten(),
        });
      }

      try {
        const result = await importStudentsFromCsv(
          classId,
          request.authUser!.id,
          request.authUser!.role,
          parsed.data.csv,
        );
        return reply.send(csvImportResultSchema.parse(result));
      } catch (error) {
        return sendHttpError(reply, error);
      }
    },
  );
}
