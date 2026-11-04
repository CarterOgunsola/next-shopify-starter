import { z } from "zod";
import { FREE_SHIPPING_PATTERN } from "./free-shipping";

// Without this, zod probes `new Function` to speed up parsing, which the
// CSP reports as an eval violation (and blocks once enforced).
z.config({ jitless: true });

// Trims stray spaces and newlines; an empty value (KEY= in .env) is unset.
const trimmed = (v: unknown) =>
  typeof v === "string" ? v.trim() || undefined : v;

// Optional vendor ids and keys. A malformed value is ignored with a
// warning, so one bad paste turns that vendor off instead of taking down
// every page and the build. The value itself is never logged.
function vendorValue(name: string, pattern: RegExp) {
  return z.preprocess(
    trimmed,
    z
      .string()
      .regex(pattern)
      .optional()
      .catch(() => {
        console.warn(`[env] ${name} is malformed and was ignored.`);
        return undefined;
      }),
  );
}

// Public vars are inlined into the client bundle at build time, so each one
// has to be referenced by its full name (no destructuring process.env).
const publicSchema = z.object({
  NEXT_PUBLIC_SITE_URL: z.preprocess(
    trimmed,
    z.url().default("http://localhost:4747"),
  ),
  NEXT_PUBLIC_GTM_ID: vendorValue("NEXT_PUBLIC_GTM_ID", /^GTM-[A-Z0-9]+$/),
  // Klaviyo public API key ("site ID", 6 characters). Safe in the browser.
  NEXT_PUBLIC_KLAVIYO_SITE_ID: vendorValue(
    "NEXT_PUBLIC_KLAVIYO_SITE_ID",
    /^[A-Za-z0-9]{6}$/,
  ),
  // Order subtotal for free shipping, e.g. 50.00. Mirrors the Shopify
  // shipping rate; change both together. Unset = no progress bar.
  NEXT_PUBLIC_FREE_SHIPPING_THRESHOLD: vendorValue(
    "NEXT_PUBLIC_FREE_SHIPPING_THRESHOLD",
    FREE_SHIPPING_PATTERN,
  ),
  // Attentive brand tag: the path segment in cdn.attn.tv/<brand>/dtag.js.
  NEXT_PUBLIC_ATTENTIVE_BRAND: vendorValue(
    "NEXT_PUBLIC_ATTENTIVE_BRAND",
    /^[a-z0-9-]+$/,
  ),
});

// Server vars never reach the browser. Read them through serverEnv().
const serverSchema = z.object({
  // Launch: search engines may index the site, and robots.txt lists the
  // sitemaps. Until then every response says noindex. Malformed means not
  // launched.
  SITE_INDEXED: z.preprocess(
    trimmed,
    z.stringbool().default(false).catch(false),
  ),
  // A value that isn't a boolean ("yes please") keeps the shop off with a
  // warning instead of failing every request.
  SHOP_ENABLED: z.preprocess(
    trimmed,
    z
      .stringbool()
      .default(false)
      .catch(() => {
        console.warn(
          "[env] SHOP_ENABLED isn't true or false; the shop stays off.",
        );
        return false;
      }),
  ),
  // Launch: shop pages become indexable and join the sitemap. Only with
  // SHOP_ENABLED and SITE_INDEXED. Malformed means not launched.
  SHOP_INDEXED: z.preprocess(
    trimmed,
    z.stringbool().default(false).catch(false),
  ),
  // Klaviyo private API key for the sign-up form and back-in-stock alerts
  // (scopes: lists:write, profiles:write, subscriptions:write,
  // catalogs:write). Never sent to the browser; the build fails if it shows
  // up in client output.
  KLAVIYO_PRIVATE_API_KEY: vendorValue(
    "KLAVIYO_PRIVATE_API_KEY",
    /^pk_[A-Za-z0-9]+$/,
  ),
  // Klaviyo list the sign-up form subscribes to.
  KLAVIYO_LIST_ID: vendorValue("KLAVIYO_LIST_ID", /^[A-Za-z0-9]+$/),
  // Judge.me private API token, for review lists and new reviews. Server
  // only; unset = no review list or form (ratings still show from Shopify's
  // review metafields).
  JUDGEME_PRIVATE_TOKEN: vendorValue(
    "JUDGEME_PRIVATE_TOKEN",
    /^[A-Za-z0-9_-]{8,}$/,
  ),
});

export function parsePublicEnv(raw: Record<string, string | undefined>) {
  return publicSchema.parse(raw);
}

export function parseServerEnv(raw: Record<string, string | undefined>) {
  return serverSchema.parse(raw);
}

export const publicEnv = parsePublicEnv({
  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
  NEXT_PUBLIC_GTM_ID: process.env.NEXT_PUBLIC_GTM_ID,
  NEXT_PUBLIC_KLAVIYO_SITE_ID: process.env.NEXT_PUBLIC_KLAVIYO_SITE_ID,
  NEXT_PUBLIC_ATTENTIVE_BRAND: process.env.NEXT_PUBLIC_ATTENTIVE_BRAND,
  NEXT_PUBLIC_FREE_SHIPPING_THRESHOLD:
    process.env.NEXT_PUBLIC_FREE_SHIPPING_THRESHOLD,
});

let cachedServerEnv: z.infer<typeof serverSchema> | undefined;

export function serverEnv() {
  if (typeof window !== "undefined") {
    throw new Error("serverEnv() was called in the browser.");
  }
  cachedServerEnv ??= parseServerEnv(process.env);
  return cachedServerEnv;
}
