import { defineConfig, devices } from "@playwright/test";

const webPort = Number(process.env.E2E_WEB_PORT ?? 5173);
const apiPort = Number(process.env.E2E_API_PORT ?? 3001);
const webOrigin = `http://localhost:${webPort}`;

/**
 * One browser smoke flow against local API + web.
 * Requires DATABASE_URL + JWT secrets (see .env.example).
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? "github" : "list",
  timeout: 60_000,
  use: {
    baseURL: webOrigin,
    trace: "on-first-retry",
    ...devices["Desktop Chrome"],
  },
  globalSetup: "./e2e/global-setup.ts",
  webServer: [
    {
      command: "npm run dev:api",
      url: `http://localhost:${apiPort}/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: {
        ...process.env,
        API_PORT: String(apiPort),
        CORS_ORIGINS: `${webOrigin},http://127.0.0.1:${webPort}`,
      },
    },
    {
      command: "npm run dev:web",
      url: webOrigin,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: {
        ...process.env,
        // Empty → Vite proxies /api to the API (see vite.config.ts).
        VITE_API_BASE_URL: "",
      },
    },
  ],
});
