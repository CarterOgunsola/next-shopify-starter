import { HttpResponse } from "msw";
import { isValidElement, type ReactElement, type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { server, shopify } from "@/lib/commerce/testing/msw";

vi.mock("next/cache", () => ({ cacheLife: () => {}, cacheTag: () => {} }));
const flags = vi.hoisted(() => ({ siteIndexed: false }));
vi.mock("@/lib/flags", () => ({
  isShopEnabled: () => true,
  isShopIndexed: () => false,
  isSiteIndexed: () => flags.siteIndexed,
}));

const { default: RootLayout, generateMetadata } = await import("./layout");
const { CommerceScripts } = await import("@/lib/commerce/analytics.client");

// Every element type in a rendered tree (without rendering components).
function types(node: ReactNode, found = new Set<unknown>()): Set<unknown> {
  if (Array.isArray(node)) node.forEach((child) => types(child, found));
  else if (isValidElement(node)) {
    found.add(node.type);
    types(
      (node as ReactElement<{ children?: ReactNode }>).props.children,
      found,
    );
  }
  return found;
}

describe("the root layout", () => {
  it("renders the page with Shopify's scripts while Shopify is up", async () => {
    server.use(
      shopify.operation(() =>
        HttpResponse.json({
          data: {
            shop: { id: "gid://shopify/Shop/7" },
            localization: {
              country: { isoCode: "US", currency: { isoCode: "USD" } },
              language: { isoCode: "EN" },
            },
          },
        }),
      ),
    );
    const tree = await RootLayout({
      children: <p>page</p>,
      params: Promise.resolve({}),
    } as never);
    expect(types(tree).has(CommerceScripts)).toBe(true);
  });

  it("still renders the page, without Shopify's scripts, when Shopify is down", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    server.use(shopify.operation(() => HttpResponse.error()));
    const tree = await RootLayout({
      children: <p>page</p>,
      params: Promise.resolve({}),
    } as never);
    expect(isValidElement(tree)).toBe(true);
    expect(types(tree).has(CommerceScripts)).toBe(false);
    expect(types(tree).has("main")).toBe(true);
    warn.mockRestore();
  });
});

describe("the site's metadata", () => {
  afterEach(() => {
    flags.siteIndexed = false;
  });

  it("is noindex, nofollow on every page until launch", () => {
    expect(generateMetadata().robots).toEqual({ index: false, follow: false });
  });

  it("is indexable after launch", () => {
    flags.siteIndexed = true;
    expect(generateMetadata().robots).toBeUndefined();
  });
});
