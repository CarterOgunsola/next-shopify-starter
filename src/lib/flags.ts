import "server-only";
import { notFound } from "next/navigation";
import { serverEnv } from "@/lib/env";

// Flags are read when a page renders. Pages are prerendered at build time,
// so changing a flag needs a new deploy.
export function isShopEnabled(): boolean {
  return serverEnv().SHOP_ENABLED;
}

// Search engines may index the site only after launch. Until then every
// response and page says noindex, nofollow and there are no sitemaps.
export function isSiteIndexed(): boolean {
  return serverEnv().SITE_INDEXED;
}

// Search engines may index the shop (and it's in the sitemap) only after
// launch, and never while the site itself isn't indexed.
export function isShopIndexed(): boolean {
  const env = serverEnv();
  return env.SITE_INDEXED && env.SHOP_ENABLED && env.SHOP_INDEXED;
}

// 404 unless the shop is on. Call it at the top of every shop page and route
// handler, before any Shopify call.
export function requireShop(): void {
  if (!isShopEnabled()) notFound();
}
