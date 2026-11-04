import "server-only";
import { z } from "zod";

// Static commerce settings, and the Shopify env. The env is checked on the
// first Shopify call, not at startup, so the site runs without it while the
// shop is off.

export { API_VERSION } from "./api-version";

export const STORE_LOCALE = { country: "US", language: "EN" } as const;

export const CURRENCY = "USD";

const envSchema = z.object({
  // e.g. your-store.myshopify.com. No https://, no trailing slash.
  SHOPIFY_STORE_DOMAIN: z
    .string()
    .regex(/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/, "a *.myshopify.com host"),
  // Headless channel private token. Server only; the build fails if it shows
  // up in client output (scripts/check-client-secrets.mjs).
  SHOPIFY_PRIVATE_ACCESS_TOKEN: z.string().min(1, "a token"),
});

export type CommerceEnv = {
  storeDomain: string;
  privateToken: string;
};

export class CommerceConfigError extends Error {
  constructor(problems: string[]) {
    super(
      `Shopify isn't configured: ${problems.join("; ")}. Set these in .env.local (see .env.example).`,
    );
    this.name = "CommerceConfigError";
  }
}

// Error messages name the variable and the expected format, never the value.
export function parseCommerceEnv(
  env: Record<string, string | undefined>,
): CommerceEnv {
  const result = envSchema.safeParse(env);
  if (!result.success) {
    throw new CommerceConfigError(
      result.error.issues.map((issue) => {
        const name = String(issue.path[0]);
        return env[name]
          ? `${name} should be ${issue.message}`
          : `${name} is missing`;
      }),
    );
  }
  return {
    storeDomain: result.data.SHOPIFY_STORE_DOMAIN,
    privateToken: result.data.SHOPIFY_PRIVATE_ACCESS_TOKEN,
  };
}

let cached: CommerceEnv | undefined;

export function commerceEnv(): CommerceEnv {
  cached ??= parseCommerceEnv(process.env);
  return cached;
}

// Signs Shopify webhooks: the app's API secret (or the store's webhook
// signing key for admin-created webhooks). Unset: every webhook is refused.
export function webhookSecret(): string | null {
  return process.env.SHOPIFY_WEBHOOK_SECRET?.trim() || null;
}

// Lets POST /api/revalidate/menus refresh the Shopify menus (sent as a
// Bearer token). Unset or shorter than 32 characters: the endpoint 404s.
export function menusRevalidateSecret(): string | null {
  const secret = process.env.MENUS_REVALIDATE_SECRET?.trim();
  return secret && secret.length >= 32 ? secret : null;
}

// Public values for Shopify's browser scripts and the same-origin Storefront
// API proxy. The public token is safe in the browser by design.
export function analyticsEnv(): {
  storefrontId: string;
  publicToken: string | undefined;
} {
  return {
    storefrontId: process.env.SHOPIFY_STOREFRONT_ID?.trim() || "0",
    publicToken:
      process.env.NEXT_PUBLIC_SHOPIFY_PUBLIC_ACCESS_TOKEN?.trim() || undefined,
  };
}

// Customer accounts need the Customer Account API client id (Headless
// channel) and a secret that encrypts the session cookie. Without both,
// accounts are off and the account routes say so.
export function customerAccountEnv(): {
  clientId: string;
  sessionSecret: string;
} | null {
  const clientId = process.env.SHOPIFY_CUSTOMER_CLIENT_ID?.trim();
  const sessionSecret = process.env.CUSTOMER_ACCOUNT_SESSION_SECRET?.trim();
  if (!clientId || !sessionSecret || sessionSecret.length < 32) return null;
  return { clientId, sessionSecret };
}
