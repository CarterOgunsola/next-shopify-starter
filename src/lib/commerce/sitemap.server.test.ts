import { HttpResponse } from "msw";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  handleShopSitemapIndex,
  handleShopSitemapPage,
} from "./sitemap.server";
import { server, shopify } from "./testing/msw";

const flags = vi.hoisted(() => ({ indexed: true }));
vi.mock("@/lib/flags", () => ({ isShopIndexed: () => flags.indexed }));
vi.mock("next/cache", () => ({ cacheLife: () => {}, cacheTag: () => {} }));

const pages = { PRODUCT: 2, COLLECTION: 1 } as Record<string, number>;
function sitemapApi() {
  server.use(
    shopify.query("SitemapPages", ({ variables }) =>
      HttpResponse.json({
        data: {
          sitemap: { pagesCount: { count: pages[variables.type as string] } },
        },
      }),
    ),
    shopify.query("SitemapPage", ({ variables }) =>
      HttpResponse.json({
        data: {
          sitemap: {
            resources: {
              hasNextPage: false,
              items: [
                {
                  handle: `${String(variables.type).toLowerCase()}-${variables.page}&x`,
                  updatedAt: "2026-10-01T00:00:00Z",
                },
              ],
            },
          },
        },
      }),
    ),
  );
}

afterEach(() => {
  flags.indexed = true;
});

describe("shop sitemaps", () => {
  it("index one sitemap per page of Shopify's sitemap API", async () => {
    sitemapApi();
    const body = await (await handleShopSitemapIndex()).text();
    const locs = [...body.matchAll(/<loc>([^<]+)<\/loc>/g)].map(
      (m) => new URL(m[1]).pathname,
    );
    expect(locs).toEqual([
      "/sitemap-shop/products/1.xml",
      "/sitemap-shop/products/2.xml",
      "/sitemap-shop/collections/1.xml",
    ]);
  });

  it("list a page's URLs with their last update, escaped", async () => {
    sitemapApi();
    const response = await handleShopSitemapPage("products", "2.xml");
    expect(response.headers.get("content-type")).toContain("application/xml");
    const body = await response.text();
    expect(body).toContain("/products/product-2%26x</loc>");
    expect(body).toContain("<lastmod>2026-10-01T00:00:00Z</lastmod>");
  });

  it.each([
    ["pages", "1.xml"],
    ["products", "0.xml"],
    ["products", "3.xml"],
    ["products", "1.json"],
  ])("404 for %s/%s", async (section, file) => {
    sitemapApi();
    expect((await handleShopSitemapPage(section, file)).status).toBe(404);
  });

  it.each(["constructor", "toString", "__proto__", "pages"])(
    "404 for a section that isn't one: %s",
    async (section) => {
      expect((await handleShopSitemapPage(section, "1.xml")).status).toBe(404);
    },
  );

  it("404 before launch", async () => {
    flags.indexed = false;
    expect((await handleShopSitemapIndex()).status).toBe(404);
    expect((await handleShopSitemapPage("products", "1.xml")).status).toBe(404);
  });
});
