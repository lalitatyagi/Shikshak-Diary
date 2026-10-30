import {
  assignTeacherBodySchema,
  classSchema,
  createClassBodySchema,
  createSchoolBodySchema,
  createTeacherBodySchema,
  csvImportBodySchema,
  csvImportResultSchema,
  inviteSchoolMemberBodySchema,
  schoolMemberSchema,
  schoolSchema,
  studentSchema,
  studentsListQuerySchema,
  studentsListResponseSchema,
  updateStudentBodySchema,
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
  assignTeacherToClass,
  createClassForTeacher,
  createSchool,
  createTeacherInSchool,
  importStudentsFromCsv,
  inviteSchoolMember,
  listClassesForSchool,
  listClassesForUser,
  listSchoolMembers,
  listSchoolsForUser,
  listStudentsForClass,
  updateStudentInClass,
} from "./class.service.js";

const schoolMembersSchema = z.array(schoolMemberSchema);
const classesListSchema = z.array(classSchema);

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

  app.post(
    "/schools/:schoolId/teachers",
    { preHandler: [requireAuth, requireRole("ADMIN")] },
    async (request, reply) => {
      const { schoolId } = request.params as { schoolId: string };
      const parsed = createTeacherBodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: "Invalid create-teacher payload",
          details: parsed.error.flatten(),
        });
      }

      try {
        const member = await createTeacherInSchool(schoolId, parsed.data);
        return reply.status(201).send(schoolMemberSchema.parse(member));
      } catch (error) {
        return sendHttpError(reply, error);
      }
    },
  );

  app.get(
    "/schools/:schoolId/classes",
    { preHandler: [requireAuth, requireRole("ADMIN")] },
    async (request, reply) => {
      const { schoolId } = request.params as { schoolId: string };
      try {
        const classes = await listClassesForSchool(schoolId);
        return reply.send(classesListSchema.parse(classes));
      } catch (error) {
        return sendHttpError(reply, error);
      }
    },
  );

  app.post(
    "/classes/:classId/assignments",
    { preHandler: [requireAuth, requireRole("ADMIN")] },
    async (request, reply) => {
      const { classId } = request.params as { classId: string };
      const parsed = assignTeacherBodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: "Invalid assignment payload",
          details: parsed.error.flatten(),
        });
      }

      try {
        const result = await assignTeacherToClass(classId, parsed.data);
        return reply.status(201).send(result);
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
    { preHandler: [requireAuth, requireRole("ADMIN")] },
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
        return reply.send(studentsListResponseSchema.parse(result));
      } catch (error) {
        return sendHttpError(reply, error);
      }
    },
  );

  app.patch(
    "/classes/:classId/students/:studentId",
    { preHandler: [requireAuth, requireRole(...classManagerRoles)] },
    async (request, reply) => {
      const { classId, studentId } = request.params as {
        classId: string;
        studentId: string;
      };
      const parsed = updateStudentBodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: "Invalid student update",
          details: parsed.error.flatten(),
        });
      }

      try {
        const student = await updateStudentInClass(
          classId,
          studentId,
          request.authUser!.id,
          request.authUser!.role,
          parsed.data,
        );
        return reply.send(studentSchema.parse(student));
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
