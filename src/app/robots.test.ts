import { afterEach, describe, expect, it, vi } from "vitest";
import { publicEnv } from "@/lib/env";

const flags = vi.hoisted(() => ({ site: false, shop: false }));
vi.mock("@/lib/flags", () => ({
  isSiteIndexed: () => flags.site,
  isShopIndexed: () => flags.shop,
}));

const { default: robots } = await import("./robots");

afterEach(() => {
  flags.site = false;
  flags.shop = false;
});

const site = (path: string) =>
  new URL(path, publicEnv.NEXT_PUBLIC_SITE_URL).href;

describe("robots.txt", () => {
  it("keeps crawlers out of private and duplicate shop URLs", () => {
    const { rules } = robots();
    const disallow = (Array.isArray(rules) ? rules[0] : rules).disallow;
    expect(disallow).toEqual(
      expect.arrayContaining([
        "/cart",
        "/account",
        "/search",
        "/discount/",
        "/api/",
        "/checkout",
        "/policies/",
        "/collections/*sort_by*",
        "/collections/*filter*",
      ]),
    );
  });

  it("still lets crawlers in before launch, so they see the noindex, but lists no sitemap", () => {
    const { rules, sitemap } = robots();
    expect((Array.isArray(rules) ? rules[0] : rules).allow).toBe("/");
    expect(sitemap).toBeUndefined();
  });

  it("lists the sitemap after launch, and the shop's after the shop's launch", () => {
    flags.site = true;
    expect(robots().sitemap).toBe(site("/sitemap.xml"));
    flags.shop = true;
    expect(robots().sitemap).toEqual([
      site("/sitemap.xml"),
      site("/sitemap-shop.xml"),
    ]);
  });
});
