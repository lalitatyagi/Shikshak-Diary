import { prisma } from "../db.js";

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
