import { loadEnv } from "./load-env.js";

loadEnv();

import type { FastifyInstance } from "fastify";
import { buildApp } from "./app.js";
import { prisma } from "./db.js";

const port = Number(process.env.API_PORT ?? 3001);
const host = process.env.API_HOST ?? "0.0.0.0";

async function shutdown(app: FastifyInstance): Promise<void> {
  await app.close();
  await prisma.$disconnect();
}

async function main(): Promise<void> {
  const app = await buildApp();

  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.once(signal, () => {
      void shutdown(app)
        .then(() => process.exit(0))
        .catch((error: unknown) => {
          app.log.error(error);
          process.exit(1);
        });
    });
  }

  try {
    await app.listen({ port, host });
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
}

void main();
