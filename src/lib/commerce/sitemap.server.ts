import "server-only";
import { publicEnv } from "@/lib/env";
import { isShopIndexed } from "@/lib/flags";
import { publicContext } from "./audience";
import { getSitemapEntries, getSitemapPageCount } from "./catalog.server";

// The shop's sitemaps, after launch only (SHOP_INDEXED): an index at
// /sitemap-shop.xml listing one sitemap per page of Shopify's sitemap API,
// at /sitemap-shop/{products|collections}/{page}.xml. robots.txt points to
// the index. Page counts follow the catalog (cached, expired by webhooks),
// so no redeploy is needed when it grows.

const KINDS = { products: "PRODUCT", collections: "COLLECTION" } as const;
export type SitemapSection = keyof typeof KINDS;

const xml = (body: string) =>
  new Response(`<?xml version="1.0" encoding="UTF-8"?>\n${body}`, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=0, s-maxage=3600",
    },
  });
const notFound = () => new Response("Not found", { status: 404 });

const escape = (text: string) =>
  text.replace(/[<>&'"]/g, (c) => `&#${c.charCodeAt(0)};`);
const absolute = (path: string) =>
  new URL(path, publicEnv.NEXT_PUBLIC_SITE_URL).href;

export async function handleShopSitemapIndex(): Promise<Response> {
  if (!isShopIndexed()) return notFound();
  const sitemaps: string[] = [];
  for (const [section, kind] of Object.entries(KINDS)) {
    const pages = await getSitemapPageCount(publicContext(), kind);
    for (let page = 1; page <= pages; page++) {
      sitemaps.push(absolute(`/sitemap-shop/${section}/${page}.xml`));
    }
  }
  return xml(
    `<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${sitemaps
      .map((loc) => `<sitemap><loc>${escape(loc)}</loc></sitemap>`)
      .join("\n")}\n</sitemapindex>`,
  );
}

export async function handleShopSitemapPage(
  section: string,
  file: string,
): Promise<Response> {
  if (!isShopIndexed() || !Object.hasOwn(KINDS, section)) return notFound();
  const match = /^([1-9]\d{0,5})\.xml$/.exec(file);
  if (!match) return notFound();
  const kind = KINDS[section as SitemapSection];
  const page = Number(match[1]);
  if (page > (await getSitemapPageCount(publicContext(), kind))) {
    return notFound();
  }
  const entries = await getSitemapEntries(publicContext(), kind, page);
  return xml(
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries
      .map(
        (entry) =>
          `<url><loc>${escape(absolute(entry.path))}</loc><lastmod>${escape(entry.lastModified)}</lastmod></url>`,
      )
      .join("\n")}\n</urlset>`,
  );
}
