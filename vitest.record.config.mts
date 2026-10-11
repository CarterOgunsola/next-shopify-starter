import { defineConfig } from "vitest/config";
// vitest.config.mts, by its output name: TypeScript's rule for importing
// an .mts file.
import base from "./vitest.config.mjs";

// Runs against the dev store with the real env from .env.local and no MSW:
// the fixture recorder (pnpm fixtures:record) and the live contract tests
// (pnpm test:live).
process.loadEnvFile(".env.local");

export default defineConfig({
  ...base,
  test: {
    include: [
      process.env.VITEST_LIVE ? "src/**/*.live.test.ts" : "src/**/*.record.ts",
    ],
    environment: "node",
    fileParallelism: false,
  },
});
