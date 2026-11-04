import type { MetadataRoute } from "next";
import { publicEnv } from "@/lib/env";
import { isShopIndexed, isSiteIndexed } from "@/lib/flags";

// Shopify's default robots.txt rules for a store's private and duplicate
// URLs: cart, account, search, discount links, API routes, checkout,
// policies, and collection URLs re-sorted or filtered (the unfiltered
// collection page is the one to index).
export const DISALLOWED = [
  "/cart",
  "/account",
  "/search",
  "/discount/",
  "/api/",
  "/md/",
  "/checkout",
  "/policies/",
  "/collections/*sort_by*",
  "/collections/*filter*",
  "/collections/*+*",
  "/collections/*%2B*",
];

const site = (path: string) =>
  new URL(path, publicEnv.NEXT_PUBLIC_SITE_URL).href;

// Until launch (SITE_INDEXED) crawling stays allowed, so crawlers see every
// response's noindex, but no sitemap is listed. The shop's sitemap index
// joins after the shop's launch (SHOP_INDEXED).
export default function robots(): MetadataRoute.Robots {
  const rules = { userAgent: "*", allow: "/", disallow: DISALLOWED };
  if (!isSiteIndexed()) return { rules };
  return {
    rules,
    sitemap: isShopIndexed()
      ? [site("/sitemap.xml"), site("/sitemap-shop.xml")]
      : site("/sitemap.xml"),
  };
}
