// The end-to-end tests' server: `next build` then `next start` against the
// synthetic store (preload.mjs), with the test proxy on. Every variable in
// .env.example is blanked first, so nothing from .env.local (real stores,
// vendor keys) reaches the build or the server. Values set in the process
// environment take precedence over .env files.
import { spawn, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const root = join(import.meta.dirname, "../..");
const port = process.env.E2E_PORT ?? "3100";
const blank = Object.fromEntries(
  (
    readFileSync(join(root, ".env.example"), "utf8").match(
      /^[A-Z][A-Z0-9_]*(?==)/gm,
    ) ?? []
  ).map((key) => [key, ""]),
);
// Test settings the caller chooses (pnpm test:e2e:csp), kept through the
// blanking.
const PASSED_THROUGH = ["CSP_ENFORCE"];
const env = {
  ...process.env,
  ...blank,
  ...Object.fromEntries(
    PASSED_THROUGH.filter((key) => process.env[key] !== undefined).map(
      (key) => [key, process.env[key]],
    ),
  ),
  E2E: "1",
  NEXT_TELEMETRY_DISABLED: "1",
  NODE_OPTIONS: `--import ${pathToFileURL(join(import.meta.dirname, "preload.mjs")).href}`,
  SHOP_ENABLED: "true",
  NEXT_PUBLIC_SITE_URL: `http://127.0.0.1:${port}`,
  SHOPIFY_STORE_DOMAIN: "synthetic-store.myshopify.com",
  SHOPIFY_PRIVATE_ACCESS_TOKEN: "synthetic-private-token",
  // Allowed as a checkout host by the Content Security Policy (required to
  // enforce it).
  SHOPIFY_CHECKOUT_DOMAIN: "checkout.synthetic-store.example",
  // Customer accounts on, with made-up values: signing in redirects to
  // Shopify, which the tests stand in for.
  SHOPIFY_CUSTOMER_CLIENT_ID: "00000000-0000-4000-8000-000000000000",
  CUSTOMER_ACCOUNT_SESSION_SECRET:
    "synthetic-session-secret-for-e2e-tests-only",
  // Vendors on, with made-up values, so their forms render: Judge.me is
  // answered from the review fixture; Klaviyo is refused like any outside
  // host (its forms show their error).
  JUDGEME_PRIVATE_TOKEN: "synthetic-judgeme-token",
  KLAVIYO_PRIVATE_API_KEY: "pk_synthetic",
  KLAVIYO_LIST_ID: "synthetic",
};

const next = join(root, "node_modules/.bin/next");
if (process.env.E2E_SKIP_BUILD !== "1") {
  const build = spawnSync(next, ["build"], {
    cwd: root,
    env,
    stdio: "inherit",
  });
  if (build.status !== 0) process.exit(build.status ?? 1);
}
const server = spawn(next, ["start", "-p", port], {
  cwd: root,
  env,
  stdio: "inherit",
});
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => server.kill(signal));
}
server.on("exit", (code) => process.exit(code ?? 0));
