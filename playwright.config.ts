import { defineConfig, devices } from "@playwright/test";

// End-to-end tests (e2e/): a production build served with `next start`
// against a synthetic Shopify store, never the network. See e2e/README.md.
const port = Number(process.env.E2E_PORT ?? 3100);

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.spec.ts",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  // A flaky test is a bug to fix, not to retry.
  retries: 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    trace: "retain-on-failure",
    // The client IP Vercel would send: buyer requests are refused without
    // one in production.
    extraHTTPHeaders: { "x-real-ip": "203.0.113.7" },
  },
  projects: [
    {
      name: "chromium",
      testIgnore: "perf/**",
      use: { ...devices["Desktop Chrome"] },
    },
    // Accessibility again on a phone-sized screen.
    {
      name: "mobile",
      testMatch: "accessibility.spec.ts",
      use: { ...devices["Pixel 7"] },
    },
    // pnpm perf: one page at a time, so measurements don't compete.
    {
      name: "perf",
      testMatch: "perf/*.spec.ts",
      fullyParallel: false,
      use: { ...devices["Pixel 7"] },
    },
  ],
  webServer: {
    command: "node e2e/support/serve.mjs",
    url: `http://127.0.0.1:${port}/`,
    // The build runs first.
    timeout: 600_000,
    reuseExistingServer: !process.env.CI,
    env: { E2E_PORT: String(port) },
  },
});
