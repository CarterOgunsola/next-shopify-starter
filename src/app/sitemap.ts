import type { MetadataRoute } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { content } from "@/lib/content";
import { publicEnv } from "@/lib/env";
import { isSiteIndexed } from "@/lib/flags";

// The site's own pages and any CMS pages. 404 until launch (SITE_INDEXED),
// answered per request: a 404 prerendered at build has an empty body, which
// Vercel serves as a 200. Shop pages stay out until the shop's own launch
// (they're noindex before then) and are listed in /sitemap-shop.xml after.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  if (!isSiteIndexed()) {
    await connection();
    notFound();
  }
  const pages = await content.listPages();
  const url = (path: string) =>
    new URL(path, publicEnv.NEXT_PUBLIC_SITE_URL).href;
  return [
    ...["/", "/privacy", "/terms", "/cookies", "/privacy-choices"].map(
      (path) => ({ url: url(path) }),
    ),
    ...pages.map((page) => ({
      url: url(page.path),
      ...(page.updatedAt ? { lastModified: page.updatedAt } : {}),
    })),
  ];
}
