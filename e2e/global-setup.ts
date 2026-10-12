import { execSync } from "node:child_process";

/**
 * Ensure migrations are applied and the demo teacher/class exist.
 * Does not run `db:generate` — that locks the Prisma engine while the API is
 * running locally; CI generates in a prior step. Seed refuses production.
 */
export default function globalSetup(): void {
  execSync("npm run db:migrate", { stdio: "inherit" });
  execSync("npm run db:seed", {
    stdio: "inherit",
    env: {
      ...process.env,
      NODE_ENV:
        process.env.NODE_ENV === "production"
          ? "development"
          : (process.env.NODE_ENV ?? "development"),
    },
  });
}
