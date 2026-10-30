import { Role } from "@prisma/client";
import { prisma } from "../db.js";

/** Promote a registered TEACHER so CSV import / parent links are allowed. */
export async function promoteToClassTeacher(email: string): Promise<void> {
  await prisma.user.update({
    where: { email: email.toLowerCase() },
    data: { role: Role.CLASS_TEACHER },
  });
}

/** School membership + CLASS_TEACHER role (roster / parent-link managers). */
export async function grantClassTeacherMembership(
  email: string,
  schoolId: string,
): Promise<void> {
  await grantSchoolMembership(email, schoolId);
  await promoteToClassTeacher(email);
}

/** AuditLog.userId is ON DELETE RESTRICT, so logs go first. */
export async function deleteUsersByEmail(emails: string[]): Promise<void> {
  if (emails.length === 0) {
    return;
  }
  const users = await prisma.user.findMany({
    where: { email: { in: emails.map((email) => email.toLowerCase()) } },
    select: { id: true },
  });
  const ids = users.map((user) => user.id);
  const lowered = emails.map((email) => email.toLowerCase());
  if (ids.length > 0) {
    await prisma.auditLog.deleteMany({ where: { userId: { in: ids } } });
    await prisma.refreshToken.deleteMany({ where: { userId: { in: ids } } });
    await prisma.parentLink.deleteMany({ where: { createdById: { in: ids } } });
  }
  await prisma.phoneOtp.deleteMany({
    where: { pendingEmail: { in: lowered } },
  });
  await prisma.user.deleteMany({
    where: { email: { in: lowered } },
  });
}

/**
 * Test fixture: a class plus the teacher's subject assignment.
 * Class creation over HTTP is admin-only.
 */
export async function insertClassForUser(input: {
  email: string;
  schoolId: string;
  name: string;
  academicYear: string;
  subjectName?: string;
}): Promise<{ id: string; subjectId: string }> {
  const user = await prisma.user.findUniqueOrThrow({
    where: { email: input.email.toLowerCase() },
  });
  const subjectName = input.subjectName?.trim() || "General";

  return prisma.$transaction(async (tx) => {
    const classroom = await tx.class.create({
      data: {
        schoolId: input.schoolId,
        name: input.name,
        academicYear: input.academicYear,
      },
    });

    const subject = await tx.subject.upsert({
      where: {
        schoolId_name: { schoolId: input.schoolId, name: subjectName },
      },
      create: { schoolId: input.schoolId, name: subjectName },
      update: {},
    });

    await tx.teacherClassSubject.create({
      data: {
        teacherId: user.id,
        classId: classroom.id,
        subjectId: subject.id,
      },
    });

    return { id: classroom.id, subjectId: subject.id };
  });
}

/** Test setup: an admin invite, without going through HTTP. */
export async function grantSchoolMembership(
  email: string,
  schoolId: string,
): Promise<void> {
  const user = await prisma.user.findUniqueOrThrow({
    where: { email: email.toLowerCase() },
  });
  await prisma.schoolMember.upsert({
    where: { userId_schoolId: { userId: user.id, schoolId } },
    create: { userId: user.id, schoolId },
    update: {},
  });
}
