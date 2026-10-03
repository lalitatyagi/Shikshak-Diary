import { config } from "dotenv";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Load apps/api/.env — the same file Prisma CLI uses for migrate.
 * Existing process environment wins, so a deployed host's real variables
 * are not replaced by a stray local file.
 */
export function loadEnv(): void {
  const here = fileURLToPath(new URL(".", import.meta.url));
  const apiRoot = resolve(here, "..");

  config({ path: resolve(apiRoot, ".env"), override: false });
}
