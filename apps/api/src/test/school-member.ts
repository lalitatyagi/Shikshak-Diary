import { prisma } from "../db.js";

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
  if (ids.length > 0) {
    await prisma.auditLog.deleteMany({ where: { userId: { in: ids } } });
    await prisma.refreshToken.deleteMany({ where: { userId: { in: ids } } });
  }
  await prisma.user.deleteMany({
    where: { email: { in: emails.map((email) => email.toLowerCase()) } },
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
