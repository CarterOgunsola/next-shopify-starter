// Every first-party cookie this site sets, named in one place. They share a
// prefix so they're easy to list in a cookie policy and never collide with
// Shopify's cookies (the only ones forwarded to Shopify, see
// lib/commerce/forwarded-request.ts) or a vendor's.
//
// NEXT_PUBLIC_COOKIE_PREFIX sets the prefix (read at build time, since the
// consent cookies are read in the browser too). It must start with a letter
// and use letters, digits, "_" or "-" only; anything else falls back to the
// default. Changing it on a live site signs customers out and empties carts,
// since the old cookies are no longer read.

export const DEFAULT_COOKIE_PREFIX = "store_";

export function cookiePrefix(value: string | undefined): string {
  const prefix = value?.trim();
  return prefix && /^[A-Za-z][A-Za-z0-9_-]{0,23}$/.test(prefix)
    ? prefix
    : DEFAULT_COOKIE_PREFIX;
}

export function cookieNames(prefix: string) {
  return {
    // The cart id with its access key. HttpOnly.
    cart: `${prefix}cart`,
    // The encrypted customer session, split across <name>, <name>.1 to .3
    // when it's large. HttpOnly.
    customer: `${prefix}customer`,
    // The visitor's consent as Shopify needs it (a1m0p1s0).
    visitorConsent: `${prefix}vc`,
    // The visitor's country, for the consent model.
    country: `${prefix}country`,
    // The consent choice itself (also the browser storage key).
    consent: `${prefix}consent`,
  } as const;
}

export const COOKIE_PREFIX = cookiePrefix(
  process.env.NEXT_PUBLIC_COOKIE_PREFIX,
);

export const COOKIE_NAMES = cookieNames(COOKIE_PREFIX);
