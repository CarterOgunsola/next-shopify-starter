// The end-to-end server's environment (serve.mjs), and with dev, `pnpm
// dev:synthetic`'s. Every variable in .env.example is blanked first, so
// nothing from .env.local (real stores, vendor keys) reaches the build or the
// server. Values set in the process environment take precedence over .env
// files.
import { pathToFileURL } from "node:url";

// Test settings the caller chooses (pnpm test:e2e:csp), kept through the
// blanking.
const PASSED_THROUGH = ["CSP_ENFORCE"];

export function e2eServerEnv({ env, envExample, port, preload, dev = false }) {
  const blank = Object.fromEntries(
    (envExample.match(/^[A-Z][A-Z0-9_]*(?==)/gm) ?? []).map((key) => [key, ""]),
  );
  return {
    ...env,
    ...blank,
    ...Object.fromEntries(
      PASSED_THROUGH.filter((key) => env[key] !== undefined).map((key) => [
        key,
        env[key],
      ]),
    ),
    E2E: "1",
    NEXT_TELEMETRY_DISABLED: "1",
    // Keeps the caller's Node options (CI raises the heap limit).
    NODE_OPTIONS: withPreload(env.NODE_OPTIONS, pathToFileURL(preload).href),
    SHOP_ENABLED: "true",
    // next dev only serves its own scripts to localhost, so in dev the site
    // is localhost: on 127.0.0.1 its pages would load without hydrating.
    NEXT_PUBLIC_SITE_URL: `http://${dev ? "localhost" : "127.0.0.1"}:${port}`,
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
    // A host that isn't the site's, redirected to it with a 308.
    REDIRECT_HOSTS: "old-host.example",
  };
}

// The caller's options plus the preload, which is added only if it isn't
// there yet.
function withPreload(options, preloadUrl) {
  const tokens = options?.split(/\s+/) ?? [];
  if (tokens.includes(preloadUrl) || tokens.includes(`--import=${preloadUrl}`))
    return options;
  return [options, `--import ${preloadUrl}`].filter(Boolean).join(" ");
}
