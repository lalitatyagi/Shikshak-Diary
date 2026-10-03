import { Prisma } from "@prisma/client";
import { prisma } from "./db.js";

type AuditClient = Prisma.TransactionClient | typeof prisma;

export async function writeAudit(
  db: AuditClient,
  entry: {
    userId: string;
    entity: string;
    entityId: string;
    action: string;
    before?: Prisma.InputJsonValue;
    after?: Prisma.InputJsonValue;
  },
): Promise<void> {
  await db.auditLog.create({
    data: {
      userId: entry.userId,
      entity: entry.entity,
      entityId: entry.entityId,
      action: entry.action,
      before: entry.before,
      after: entry.after,
    },
  });
}
