import { Prisma } from "@prisma/client";
import {
  classSchema,
  schoolSchema,
  startOfTodayKolkata,
  studentSchema,
  toPaginated,
  type ClassDto,
  type CreateClassBody,
  type CsvImportResult,
  type Role,
  type SchoolDto,
  type StudentDto,
} from "@classroom-tracker/shared";
import { prisma } from "../db.js";
import { writeAudit } from "../audit.js";
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

/**
 * Schools the caller can see.
 * - ADMIN: every school
 * - Everyone else: only schools an admin has added them to (`SchoolMember`)
 */
export async function listSchoolsForUser(
  userId: string,
  role: Role,
): Promise<SchoolDto[]> {
  if (role === "ADMIN") {
    const schools = await prisma.school.findMany({ orderBy: { name: "asc" } });
    return schools.map((school) => schoolSchema.parse(school));
  }

  const memberships = await prisma.schoolMember.findMany({
    where: { userId },
    select: { schoolId: true },
  });
  const schoolIds = memberships.map((row) => row.schoolId);
  if (schoolIds.length === 0) {
    return [];
  }

  const schools = await prisma.school.findMany({
    where: { id: { in: schoolIds } },
    orderBy: { name: "asc" },
  });
  return schools.map((school) => schoolSchema.parse(school));
}

/**
 * A teacher may create a class only in a school they have been invited to.
 * ADMIN may create a class in any existing school.
 */
export async function assertCanCreateInSchool(
  teacherId: string,
  role: Role,
  schoolId: string,
): Promise<void> {
  const school = await prisma.school.findUnique({ where: { id: schoolId } });
  if (!school) {
    throw new HttpError("School not found", 404);
  }

  if (role === "ADMIN") {
    return;
  }

  const membership = await prisma.schoolMember.findUnique({
    where: { userId_schoolId: { userId: teacherId, schoolId } },
    select: { userId: true },
  });
  if (!membership) {
    throw new HttpError("You do not belong to this school", 403);
  }
}

export async function createSchool(name: string): Promise<SchoolDto> {
  const school = await prisma.school.create({ data: { name } });
  return schoolSchema.parse(school);
}

export async function inviteSchoolMember(
  schoolId: string,
  email: string,
): Promise<{ schoolId: string; userId: string; email: string }> {
  const school = await prisma.school.findUnique({ where: { id: schoolId } });
  if (!school) {
    throw new HttpError("School not found", 404);
  }

  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase() },
  });
  if (!user) {
    throw new HttpError("No user is registered with that email", 404);
  }
  if (user.role === "PARENT") {
    throw new HttpError("Parents cannot be added to a school", 400);
  }

  await prisma.schoolMember.upsert({
    where: { userId_schoolId: { userId: user.id, schoolId } },
    create: { userId: user.id, schoolId },
    update: {},
  });

  return { schoolId, userId: user.id, email: user.email };
}

export async function createClassForTeacher(
  teacherId: string,
  role: Role,
  input: CreateClassBody,
): Promise<ClassDto> {
  await assertCanCreateInSchool(teacherId, role, input.schoolId);

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

/**
 * Never trust classId alone: class must exist and the teacher must have a
 * TeacherClassSubject row for it (unless ADMIN).
 */
export async function assertCanAccessClass(
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
  options: { page: number; pageSize: number; q?: string } = {
    page: 1,
    pageSize: 40,
  },
): Promise<{
  items: StudentDto[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}> {
  await assertCanAccessClass(classId, userId, role);

  const studentFilter = studentSearchWhere(options.q);
  const where = {
    classId,
    ...(studentFilter ? { student: studentFilter } : {}),
  };

  const [total, enrollments] = await Promise.all([
    prisma.enrollment.count({ where }),
    prisma.enrollment.findMany({
      where,
      include: { student: true },
      orderBy: { student: { rollNumber: "asc" } },
      skip: (options.page - 1) * options.pageSize,
      take: options.pageSize,
    }),
  ]);

  return toPaginated(
    enrollments.map((enrollment) => toStudentDto(enrollment.student)),
    total,
    options.page,
    options.pageSize,
  );
}

function studentSearchWhere(q?: string):
  | { OR: Array<Record<string, unknown>> }
  | undefined {
  if (!q) return undefined;
  const roll = Number(q);
  const or: Array<Record<string, unknown>> = [
    { name: { contains: q, mode: "insensitive" } },
  ];
  if (Number.isInteger(roll) && roll > 0) {
    or.push({ rollNumber: roll });
  }
  return { OR: or };
}

export async function importStudentsFromCsv(
  classId: string,
  userId: string,
  role: Role,
  csvText: string,
): Promise<CsvImportResult> {
  const classroom = await assertCanAccessClass(classId, userId, role);
  const parsed = parseStudentCsv(csvText);

  if (parsed.rows.length === 0) {
    return {
      imported: 0,
      failed: new Set(parsed.errors.map((error) => error.row)).size,
      errors: parsed.errors,
      students: [],
    };
  }

  try {
    return await prisma.$transaction(
      (tx) =>
        importRows(tx, {
          classId,
          schoolId: classroom.schoolId,
          userId,
          role,
          rows: parsed.rows,
          parseErrors: parsed.errors,
        }),
      { timeout: 15_000 },
    );
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return {
        imported: 0,
        failed: parsed.rows.length,
        errors: [
          ...parsed.errors,
          {
            row: parsed.rows[0]?.row ?? 1,
            message:
              "A roll number was claimed by another import. Retry those rows.",
          },
        ].sort((a, b) => a.row - b.row),
        students: [],
      };
    }
    throw error;
  }
}

async function importRows(
  tx: Prisma.TransactionClient,
  input: {
    classId: string;
    schoolId: string;
    userId: string;
    role: Role;
    rows: ParsedCsvRow[];
    parseErrors: CsvImportResult["errors"];
  },
): Promise<CsvImportResult> {
  // Serialize imports in this school, and task creation for this class.
  await tx.$queryRaw(
    Prisma.sql`SELECT id FROM "School" WHERE id = ${input.schoolId} FOR UPDATE`,
  );
  await tx.$queryRaw(
    Prisma.sql`SELECT id FROM "Class" WHERE id = ${input.classId} FOR UPDATE`,
  );

  const existing = await tx.student.findMany({
    where: { schoolId: input.schoolId },
    include: { enrollments: { select: { classId: true } } },
  });
  const byRoll = new Map(
    existing.map((student) => [student.rollNumber, student]),
  );

  const enrolledHere = await tx.enrollment.findMany({
    where: { classId: input.classId },
    select: { studentId: true },
  });
  const enrolledIds = new Set(enrolledHere.map((row) => row.studentId));

  const accessibleClassIds =
    input.role === "ADMIN"
      ? null
      : new Set(
          (
            await tx.teacherClassSubject.findMany({
              where: { teacherId: input.userId },
              select: { classId: true },
            })
          ).map((row) => row.classId),
        );

  const openTasks = await tx.task.findMany({
    where: {
      classId: input.classId,
      dueOn: { gte: startOfTodayKolkata() },
    },
    select: { id: true },
  });

  const errors = [...input.parseErrors];
  const toCreate: ParsedCsvRow[] = [];
  const toUpdate: Array<{ row: ParsedCsvRow; id: string }> = [];

  for (const row of input.rows) {
    const student = byRoll.get(row.rollNumber);
    if (student && enrolledIds.has(student.id)) {
      errors.push({
        row: row.row,
        message: `Student with rollNumber ${row.rollNumber} is already enrolled in this class`,
      });
      continue;
    }
    if (
      student &&
      accessibleClassIds &&
      student.enrollments.some(
        (enrollment) => !accessibleClassIds.has(enrollment.classId),
      )
    ) {
      errors.push({
        row: row.row,
        message: `Roll number ${row.rollNumber} belongs to a student in a class you cannot access`,
      });
      continue;
    }
    if (student) {
      toUpdate.push({ row, id: student.id });
    } else {
      toCreate.push(row);
    }
  }

  const created =
    toCreate.length === 0
      ? []
      : await tx.student.createManyAndReturn({
          data: toCreate.map((row) => ({
            schoolId: input.schoolId,
            name: row.name,
            rollNumber: row.rollNumber,
            parentContact: row.parentContact,
          })),
        });

  const updated = [];
  for (const item of toUpdate) {
    updated.push(
      await tx.student.update({
        where: { id: item.id },
        data: {
          name: item.row.name,
          parentContact: item.row.parentContact,
        },
      }),
    );
  }

  const importedStudents = [...created, ...updated].map((student) =>
    toStudentDto(student),
  );

  if (importedStudents.length > 0) {
    await tx.enrollment.createMany({
      data: importedStudents.map((student) => ({
        studentId: student.id,
        classId: input.classId,
      })),
      skipDuplicates: true,
    });

    if (openTasks.length > 0) {
      await tx.taskStatus.createMany({
        data: importedStudents.flatMap((student) =>
          openTasks.map((task) => ({
            taskId: task.id,
            studentId: student.id,
            status: "PENDING" as const,
          })),
        ),
        skipDuplicates: true,
      });
    }
  }

  if (importedStudents.length > 0) {
    await writeAudit(tx, {
      userId: input.userId,
      entity: "Class",
      entityId: input.classId,
      action: "import-students",
      after: {
        imported: importedStudents.length,
        rollNumbers: importedStudents.map((student) => student.rollNumber),
      },
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
