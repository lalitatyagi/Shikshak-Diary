import {
  classSchema,
  createClassBodySchema,
  createSchoolBodySchema,
  csvImportBodySchema,
  csvImportResultSchema,
  inviteSchoolMemberBodySchema,
  paginatedResponseSchema,
  schoolMemberSchema,
  schoolSchema,
  studentSchema,
  studentsListQuerySchema,
} from "@classroom-tracker/shared";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  classManagerRoles,
  requireAuth,
  requireRole,
  teacherRoles,
} from "../auth/auth.middleware.js";
import { sendHttpError } from "../errors.js";
import {
  createClassForTeacher,
  createSchool,
  importStudentsFromCsv,
  inviteSchoolMember,
  listClassesForUser,
  listSchoolMembers,
  listSchoolsForUser,
  listStudentsForClass,
} from "./class.service.js";

const schoolMembersSchema = z.array(schoolMemberSchema);

const paginatedStudentsSchema = paginatedResponseSchema(studentSchema);

export async function classRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    "/schools",
    { preHandler: [requireAuth, requireRole("ADMIN")] },
    async (request, reply) => {
      const parsed = createSchoolBodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: "Invalid school payload",
          details: parsed.error.flatten(),
        });
      }

      const school = await createSchool(parsed.data.name);
      return reply.status(201).send(schoolSchema.parse(school));
    },
  );

  app.post(
    "/schools/:schoolId/members",
    { preHandler: [requireAuth, requireRole("ADMIN")] },
    async (request, reply) => {
      const { schoolId } = request.params as { schoolId: string };
      const parsed = inviteSchoolMemberBodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: "Invalid invite payload",
          details: parsed.error.flatten(),
        });
      }

      try {
        const member = await inviteSchoolMember(
          schoolId,
          parsed.data.email,
          parsed.data.role,
        );
        return reply.status(201).send(schoolMemberSchema.parse(member));
      } catch (error) {
        return sendHttpError(reply, error);
      }
    },
  );

  app.get(
    "/schools/:schoolId/members",
    { preHandler: [requireAuth, requireRole("ADMIN")] },
    async (request, reply) => {
      const { schoolId } = request.params as { schoolId: string };
      try {
        const members = await listSchoolMembers(schoolId);
        return reply.send(schoolMembersSchema.parse(members));
      } catch (error) {
        return sendHttpError(reply, error);
      }
    },
  );

  app.get(
    "/schools",
    { preHandler: [requireAuth, requireRole(...teacherRoles)] },
    async (request, reply) => {
      const user = request.authUser!;
      const schools = await listSchoolsForUser(user.id, user.role);
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
          request.authUser!.role,
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
      const parsed = studentsListQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        return reply.status(400).send({
          error: "Invalid students query",
          details: parsed.error.flatten(),
        });
      }
      try {
        const result = await listStudentsForClass(
          classId,
          request.authUser!.id,
          request.authUser!.role,
          parsed.data,
        );
        return reply.send(paginatedStudentsSchema.parse(result));
      } catch (error) {
        return sendHttpError(reply, error);
      }
    },
  );

  app.post(
    "/classes/:classId/students/import",
    { preHandler: [requireAuth, requireRole(...classManagerRoles)] },
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
