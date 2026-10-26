import { z } from "zod";
import { normalizeIndianPhone } from "./auth.js";
import { roleSchema } from "./enums.js";
import { paginatedResponseSchema } from "./pagination.js";

export const createSchoolBodySchema = z.object({
  name: z.string().trim().min(1).max(120),
});

export const inviteSchoolMemberBodySchema = z.object({
  email: z.string().trim().email(),
  /** Admin may promote an invited teacher to class teacher. */
  role: z.enum(["TEACHER", "CLASS_TEACHER"]).optional(),
});

/** Admin creates a teacher account and adds them to the school (no OTP). */
export const createTeacherBodySchema = z.object({
  name: z.string().trim().min(1).max(100),
  email: z.string().trim().email().max(255),
  password: z.string().min(8).max(128),
  role: z.enum(["TEACHER", "CLASS_TEACHER"]).default("TEACHER"),
  phone: z.string().trim().max(16).optional(),
});

/** Admin assigns a school teacher to a class (subject). */
export const assignTeacherBodySchema = z.object({
  teacherId: z.string().min(1),
  subjectName: z.string().trim().min(1).max(100).default("General"),
});

export const schoolMemberSchema = z.object({
  schoolId: z.string().min(1),
  userId: z.string().min(1),
  email: z.string().email(),
  name: z.string().min(1),
  role: roleSchema,
  /** Class names this teacher is assigned to teach. */
  classNames: z.array(z.string()).default([]),
});

export const createClassBodySchema = z.object({
  schoolId: z.string().min(1),
  name: z.string().trim().min(1).max(50),
  academicYear: z.string().trim().min(4).max(20),
  /** Subject the teacher teaches in this class; defaults to "General". */
  subjectName: z.string().trim().min(1).max(100).default("General"),
});

export const schoolSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
});

export const classSchema = z.object({
  id: z.string().min(1),
  schoolId: z.string().min(1),
  name: z.string().min(1),
  academicYear: z.string().min(1),
  studentCount: z.number().int().nonnegative().optional(),
});

export const studentSchema = z.object({
  id: z.string().min(1),
  schoolId: z.string().min(1),
  name: z.string().min(1),
  rollNumber: z.number().int().positive(),
  parentContact: z.string().nullable(),
});

/**
 * Class teacher / admin updates parent phone for WhatsApp.
 * Empty string or null clears the number.
 */
export const updateStudentBodySchema = z.object({
  parentContact: z.union([z.string(), z.null()]).transform((value, ctx) => {
    if (value == null || value.trim() === "") {
      return null;
    }
    const normalized = normalizeIndianPhone(value);
    if (!normalized) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Use a valid 10-digit Indian mobile number",
      });
      return z.NEVER;
    }
    return normalized;
  }),
});

/** Paginated roster plus class-wide missing-phone count (ignores search filter). */
export const studentsListResponseSchema = paginatedResponseSchema(
  studentSchema,
).extend({
  missingParentContactCount: z.number().int().nonnegative(),
});

export const csvImportBodySchema = z.object({
  csv: z.string().min(1),
});

export const csvRowErrorSchema = z.object({
  row: z.number().int().positive(),
  message: z.string().min(1),
});

export const csvImportResultSchema = z.object({
  imported: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  errors: z.array(csvRowErrorSchema),
  students: z.array(studentSchema),
});

export type CreateSchoolBody = z.infer<typeof createSchoolBodySchema>;
export type InviteSchoolMemberBody = z.infer<
  typeof inviteSchoolMemberBodySchema
>;
export type CreateTeacherBody = z.infer<typeof createTeacherBodySchema>;
export type AssignTeacherBody = z.infer<typeof assignTeacherBodySchema>;
export type CreateClassBody = z.infer<typeof createClassBodySchema>;
export type SchoolDto = z.infer<typeof schoolSchema>;
export type ClassDto = z.infer<typeof classSchema>;
export type StudentDto = z.infer<typeof studentSchema>;
export type UpdateStudentBody = z.infer<typeof updateStudentBodySchema>;
export type StudentsListResponse = z.infer<typeof studentsListResponseSchema>;
export type SchoolMemberDto = z.infer<typeof schoolMemberSchema>;
export type CsvImportBody = z.infer<typeof csvImportBodySchema>;
export type CsvImportResult = z.infer<typeof csvImportResultSchema>;
