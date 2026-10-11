import type { MetadataRoute } from "next";
import { publicEnv } from "@/lib/env";
import { isShopIndexed } from "@/lib/flags";

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

// The shop's sitemap index joins after launch (SHOP_INDEXED).
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: DISALLOWED },
    sitemap: isShopIndexed()
      ? [site("/sitemap.xml"), site("/sitemap-shop.xml")]
      : site("/sitemap.xml"),
  };
}
