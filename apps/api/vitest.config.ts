import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // bcrypt cost 12 is intentionally slow; parallel files can exceed the default 10s hook.
    hookTimeout: 30_000,
    testTimeout: 20_000,
  },
});
