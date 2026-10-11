// The store's own names, in one place: shown to visitors (page titles, the
// header, the sender of marketing email) and sent to vendors (the source
// label on email sign-ups). Nothing else in the code names the store; the
// brand test (brand.test.ts) fails if a configured name shows up anywhere
// else in the repo.
//
// Set them per deployment. They're read at build time, so client
// components get them too:
// - NEXT_PUBLIC_STORE_NAME: the store's name. Default "Store".
// - NEXT_PUBLIC_SITE_NAME: the name in the header and on the home page, if
//   it differs. Default: the store's name.
// - NEXT_PUBLIC_SOURCE_PREFIX: prefixes the source of an email sign-up in
//   Klaviyo ("<prefix> footer"). Default: the store's name.

export const DEFAULT_STORE_NAME = "Store";

const value = (raw: string | undefined) => raw?.trim() || undefined;

export function brandFrom(env: {
  NEXT_PUBLIC_STORE_NAME?: string;
  NEXT_PUBLIC_SITE_NAME?: string;
  NEXT_PUBLIC_SOURCE_PREFIX?: string;
}) {
  const name = value(env.NEXT_PUBLIC_STORE_NAME) ?? DEFAULT_STORE_NAME;
  return {
    name,
    siteName: value(env.NEXT_PUBLIC_SITE_NAME) ?? name,
    sourcePrefix: value(env.NEXT_PUBLIC_SOURCE_PREFIX) ?? name,
  } as const;
}

// Each variable by its full name, so Next inlines it into the browser
// bundle.
export const BRAND = brandFrom({
  NEXT_PUBLIC_STORE_NAME: process.env.NEXT_PUBLIC_STORE_NAME,
  NEXT_PUBLIC_SITE_NAME: process.env.NEXT_PUBLIC_SITE_NAME,
  NEXT_PUBLIC_SOURCE_PREFIX: process.env.NEXT_PUBLIC_SOURCE_PREFIX,
});
