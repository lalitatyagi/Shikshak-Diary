import { Prisma } from "@prisma/client";
import {
  classSchema,
  schoolSchema,
  studentSchema,
  type ClassDto,
  type CreateClassBody,
  type CsvImportResult,
  type SchoolDto,
  type StudentDto,
} from "@classroom-tracker/shared";
import type { Role } from "@classroom-tracker/shared";
import { prisma } from "../db.js";
import { HttpError } from "../errors.js";
import { parseStudentCsv, type ParsedCsvRow } from "./csv.js";

function toClassDto(
  classroom: {
    id: string;
    schoolId: string;
    name: string;
    academicYear: string;
  },
  studentCount?: number,
): ClassDto {
  return classSchema.parse({
    id: classroom.id,
    schoolId: classroom.schoolId,
    name: classroom.name,
    academicYear: classroom.academicYear,
    studentCount,
  });
}

function toStudentDto(student: {
  id: string;
  schoolId: string;
  name: string;
  rollNumber: number;
  parentContact: string | null;
}): StudentDto {
  return studentSchema.parse(student);
}

export async function listSchools(): Promise<SchoolDto[]> {
  const schools = await prisma.school.findMany({ orderBy: { name: "asc" } });
  return schools.map((school) => schoolSchema.parse(school));
}

export async function createClassForTeacher(
  teacherId: string,
  input: CreateClassBody,
): Promise<ClassDto> {
  const school = await prisma.school.findUnique({
    where: { id: input.schoolId },
  });
  if (!school) {
    throw new HttpError("School not found", 404);
  }

  try {
    const created = await prisma.$transaction(async (tx) => {
      const classroom = await tx.class.create({
        data: {
          schoolId: input.schoolId,
          name: input.name,
          academicYear: input.academicYear,
        },
      });

      let subject = await tx.subject.findUnique({
        where: {
          schoolId_name: {
            schoolId: input.schoolId,
            name: input.subjectName,
          },
        },
      });

      if (!subject) {
        subject = await tx.subject.create({
          data: {
            schoolId: input.schoolId,
            name: input.subjectName,
          },
        });
      }

      await tx.teacherClassSubject.create({
        data: {
          teacherId,
          classId: classroom.id,
          subjectId: subject.id,
        },
      });

      return classroom;
    });

    return toClassDto(created, 0);
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      throw new HttpError(
        "A class with this name and academic year already exists in the school",
        409,
      );
    }
    throw error;
  }
}

export async function listClassesForUser(
  userId: string,
  role: Role,
): Promise<ClassDto[]> {
  if (role === "ADMIN") {
    const classes = await prisma.class.findMany({
      orderBy: [{ academicYear: "desc" }, { name: "asc" }],
      include: { _count: { select: { enrollments: true } } },
    });
    return classes.map((c) => toClassDto(c, c._count.enrollments));
  }

  const assignments = await prisma.teacherClassSubject.findMany({
    where: { teacherId: userId },
    include: {
      class: {
        include: { _count: { select: { enrollments: true } } },
      },
    },
  });

  const byId = new Map<string, ClassDto>();
  for (const assignment of assignments) {
    byId.set(
      assignment.class.id,
      toClassDto(assignment.class, assignment.class._count.enrollments),
    );
  }

  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
}

async function assertCanAccessClass(
  classId: string,
  userId: string,
  role: Role,
): Promise<{ id: string; schoolId: string }> {
  const classroom = await prisma.class.findUnique({ where: { id: classId } });
  if (!classroom) {
    throw new HttpError("Class not found", 404);
  }

  if (role === "ADMIN") {
    return classroom;
  }

  const assignment = await prisma.teacherClassSubject.findFirst({
    where: { classId, teacherId: userId },
  });
  if (!assignment) {
    throw new HttpError("You are not assigned to this class", 403);
  }

  return classroom;
}

export async function listStudentsForClass(
  classId: string,
  userId: string,
  role: Role,
): Promise<StudentDto[]> {
  await assertCanAccessClass(classId, userId, role);

  const enrollments = await prisma.enrollment.findMany({
    where: { classId },
    include: { student: true },
    orderBy: { student: { rollNumber: "asc" } },
  });

  return enrollments.map((enrollment) => toStudentDto(enrollment.student));
}

export async function importStudentsFromCsv(
  classId: string,
  userId: string,
  role: Role,
  csvText: string,
): Promise<CsvImportResult> {
  const classroom = await assertCanAccessClass(classId, userId, role);
  const parsed = parseStudentCsv(csvText);

  const errors = [...parsed.errors];
  const importedStudents: StudentDto[] = [];

  // Preload existing rolls in this school for conflict checks
  const existing = await prisma.student.findMany({
    where: { schoolId: classroom.schoolId },
    select: { id: true, rollNumber: true },
  });
  const rollToStudentId = new Map(
    existing.map((student) => [student.rollNumber, student.id]),
  );

  const enrolled = await prisma.enrollment.findMany({
    where: { classId },
    select: { studentId: true },
  });
  const enrolledIds = new Set(enrolled.map((row) => row.studentId));

  const accepted: ParsedCsvRow[] = [];

  for (const row of parsed.rows) {
    const existingId = rollToStudentId.get(row.rollNumber);
    if (existingId && enrolledIds.has(existingId)) {
      errors.push({
        row: row.row,
        message: `Student with rollNumber ${row.rollNumber} is already enrolled in this class`,
      });
      continue;
    }
    accepted.push(row);
  }

  if (accepted.length > 0) {
    await prisma.$transaction(async (tx) => {
      for (const row of accepted) {
        let studentId = rollToStudentId.get(row.rollNumber);

        if (!studentId) {
          const created = await tx.student.create({
            data: {
              schoolId: classroom.schoolId,
              name: row.name,
              rollNumber: row.rollNumber,
              parentContact: row.parentContact,
            },
          });
          studentId = created.id;
          rollToStudentId.set(row.rollNumber, studentId);
          importedStudents.push(toStudentDto(created));
        } else {
          const updated = await tx.student.update({
            where: { id: studentId },
            data: {
              name: row.name,
              parentContact: row.parentContact,
            },
          });
          importedStudents.push(toStudentDto(updated));
        }

        await tx.enrollment.create({
          data: {
            studentId,
            classId,
          },
        });
        enrolledIds.add(studentId);
      }
    });
  }

  const failedRows = new Set(errors.map((error) => error.row)).size;

  return {
    imported: importedStudents.length,
    failed: failedRows,
    errors: errors.sort((a, b) => a.row - b.row),
    students: importedStudents.sort((a, b) => a.rollNumber - b.rollNumber),
  };
}
