import type { MetadataRoute } from "next";
import { notFound } from "next/navigation";
import { content } from "@/lib/content";
import { publicEnv } from "@/lib/env";
import { isSiteIndexed } from "@/lib/flags";

// The site's own pages and any CMS pages, after launch only (SITE_INDEXED).
// Shop pages stay out until the shop's own launch (they're noindex before
// then) and are listed in /sitemap-shop.xml after.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  if (!isSiteIndexed()) notFound();
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
