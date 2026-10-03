import { z } from "zod";

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

export type CreateClassBody = z.infer<typeof createClassBodySchema>;
export type SchoolDto = z.infer<typeof schoolSchema>;
export type ClassDto = z.infer<typeof classSchema>;
export type StudentDto = z.infer<typeof studentSchema>;
export type CsvImportBody = z.infer<typeof csvImportBodySchema>;
export type CsvImportResult = z.infer<typeof csvImportResultSchema>;
