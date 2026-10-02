import { PrismaClient } from "@prisma/client";

/**
 * Single PrismaClient for the API process.
 * In serverless/hot-reload, reuse the global to avoid exhausting connections.
 */
const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
