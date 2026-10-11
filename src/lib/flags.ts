import "server-only";
import { notFound } from "next/navigation";
import { serverEnv } from "@/lib/env";

// Flags are read when a page renders. Pages are prerendered at build time,
// so changing a flag needs a new deploy.
export function isShopEnabled(): boolean {
  return serverEnv().SHOP_ENABLED;
}

// Search engines may index the shop (and it's in the sitemap) only after
// launch.
export function isShopIndexed(): boolean {
  const env = serverEnv();
  return env.SHOP_ENABLED && env.SHOP_INDEXED;
}

// 404 unless the shop is on. Call it at the top of every shop page and route
// handler, before any Shopify call.
export function requireShop(): void {
  if (!isShopEnabled()) notFound();
}
