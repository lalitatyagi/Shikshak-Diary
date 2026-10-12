import { defineConfig } from "vitest/config";

/**
 * Shared Zod schemas and status rules are the product's business contract.
 * Keep coverage high here so type drifts fail CI before they reach the API.
 */
export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary"],
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts", "src/index.ts"],
      thresholds: {
        lines: 90,
        functions: 90,
        branches: 85,
        statements: 90,
      },
    },
  },
});
