import { config } from "dotenv";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Always load apps/api/.env — same file Prisma CLI uses for migrate.
 * Do not prefer the monorepo root .env (neon link writes there; it can diverge).
 */
export function loadEnv(): void {
  const here = fileURLToPath(new URL(".", import.meta.url));
  const apiRoot = resolve(here, "..");

  config({ path: resolve(apiRoot, ".env"), override: true });
}
