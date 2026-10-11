import { createHash, randomBytes } from "node:crypto";
import {
  parentLinkCreatedSchema,
  parentLinkMetaSchema,
  parentLinkStatusSchema,
  type ParentLinkCreated,
  type ParentLinkStatus,
  type Role,
  type StudentReport,
} from "@classroom-tracker/shared";
import { prisma } from "../db.js";
import { HttpError } from "../errors.js";
import { writeAudit } from "../audit.js";
import { assertCanAccessClass } from "../classes/class.service.js";
import { buildStudentReport } from "../reports/report.service.js";

function hashParentToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function newParentToken(): string {
  return randomBytes(32).toString("base64url");
}

function parentPath(token: string): string {
  return `/p/${token}`;
}

function isActive(
  link: { expiresAt: Date; revokedAt: Date | null },
  now: Date,
): boolean {
  return link.revokedAt == null && link.expiresAt.getTime() > now.getTime();
}

function toMeta(
  link: {
    id: string;
    expiresAt: Date;
    createdAt: Date;
    revokedAt: Date | null;
  },
  now: Date,
) {
  return parentLinkMetaSchema.parse({
    id: link.id,
    expiresAt: link.expiresAt.toISOString(),
    createdAt: link.createdAt.toISOString(),
    revokedAt: link.revokedAt ? link.revokedAt.toISOString() : null,
    active: isActive(link, now),
  });
}

async function assertEnrolled(classId: string, studentId: string): Promise<void> {
  const enrollment = await prisma.enrollment.findUnique({
    where: { studentId_classId: { studentId, classId } },
  });
  if (!enrollment) {
    throw new HttpError("Student is not enrolled in this class", 404);
  }
}

export async function getParentLinkStatus(
  classId: string,
  studentId: string,
  userId: string,
  role: Role,
  now: Date = new Date(),
): Promise<ParentLinkStatus> {
  await assertCanAccessClass(classId, userId, role);
  await assertEnrolled(classId, studentId);

  const link = await prisma.parentLink.findUnique({
    where: { classId_studentId: { classId, studentId } },
  });

  return parentLinkStatusSchema.parse({
    link: link ? toMeta(link, now) : null,
  });
}

/**
 * Create or rotate the share token for one student in a class.
 * Previous token stops working immediately.
 */
export async function createOrRotateParentLink(
  classId: string,
  studentId: string,
  userId: string,
  role: Role,
  expiresInDays: number,
  now: Date = new Date(),
): Promise<ParentLinkCreated> {
  await assertCanAccessClass(classId, userId, role);
  await assertEnrolled(classId, studentId);

  const token = newParentToken();
  const tokenHash = hashParentToken(token);
  const expiresAt = new Date(
    now.getTime() + expiresInDays * 24 * 60 * 60 * 1000,
  );

  const existing = await prisma.parentLink.findUnique({
    where: { classId_studentId: { classId, studentId } },
  });

  const link = existing
    ? await prisma.parentLink.update({
        where: { id: existing.id },
        data: {
          tokenHash,
          createdById: userId,
          expiresAt,
          revokedAt: null,
          createdAt: now,
        },
      })
    : await prisma.parentLink.create({
        data: {
          classId,
          studentId,
          tokenHash,
          createdById: userId,
          expiresAt,
        },
      });

  await writeAudit(prisma, {
    userId,
    entity: "ParentLink",
    entityId: link.id,
    action: existing ? "rotate" : "create",
    before: existing
      ? {
          expiresAt: existing.expiresAt.toISOString(),
          revokedAt: existing.revokedAt?.toISOString() ?? null,
        }
      : undefined,
    after: {
      expiresAt: link.expiresAt.toISOString(),
      revokedAt: null,
    },
  });

  return parentLinkCreatedSchema.parse({
    ...toMeta(link, now),
    token,
    path: parentPath(token),
  });
}

export async function revokeParentLink(
  classId: string,
  studentId: string,
  userId: string,
  role: Role,
  now: Date = new Date(),
): Promise<ParentLinkStatus> {
  await assertCanAccessClass(classId, userId, role);
  await assertEnrolled(classId, studentId);

  const existing = await prisma.parentLink.findUnique({
    where: { classId_studentId: { classId, studentId } },
  });
  if (!existing) {
    throw new HttpError("No parent link for this student", 404);
  }
  if (existing.revokedAt) {
    return parentLinkStatusSchema.parse({ link: toMeta(existing, now) });
  }

  const link = await prisma.parentLink.update({
    where: { id: existing.id },
    data: { revokedAt: now },
  });

  await writeAudit(prisma, {
    userId,
    entity: "ParentLink",
    entityId: link.id,
    action: "revoke",
    before: { revokedAt: null },
    after: { revokedAt: link.revokedAt?.toISOString() ?? null },
  });

  return parentLinkStatusSchema.parse({ link: toMeta(link, now) });
}

export async function getReportByParentToken(
  token: string,
  days: number,
  now: Date = new Date(),
): Promise<StudentReport> {
  if (!token || token.length < 32) {
    throw new HttpError("Parent link not found", 404);
  }

  const link = await prisma.parentLink.findUnique({
    where: { tokenHash: hashParentToken(token) },
  });
  if (!link || !isActive(link, now)) {
    throw new HttpError("Parent link not found", 404);
  }

  return buildStudentReport(link.classId, link.studentId, days, now);
}
