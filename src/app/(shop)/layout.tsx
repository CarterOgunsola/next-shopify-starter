import type { Metadata } from "next";
import type { ReactNode } from "react";
import { isShopIndexed, requireShop } from "@/lib/flags";

// Every page in this group is the shop, at Shopify's standard paths
// (/shop, /products/{handle}, /collections/{handle}, /search, /cart).
// 404 while the shop flag is off, noindex until launch (SHOP_INDEXED).
// Pages also call requireShop(), because a layout and its page render in
// parallel.
export function generateMetadata(): Metadata {
  return isShopIndexed() ? {} : { robots: { index: false, follow: false } };
}

export default function ShopLayout({ children }: { children: ReactNode }) {
  requireShop();
  return children;
}
