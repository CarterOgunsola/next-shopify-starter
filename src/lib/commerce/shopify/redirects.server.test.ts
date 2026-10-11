import { HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";
import { server, shopify } from "../testing/msw";
import { findShopifyRedirect } from "./redirects.server";

vi.mock("next/headers", () => ({
  headers: async () => new Headers(),
  cookies: async () => ({ get: () => undefined }),
}));

const redirectTo = (target: string | null) =>
  shopify.query("redirects", ({ variables }) =>
    HttpResponse.json({
      data: {
        urlRedirects: {
          edges:
            target && variables.query === "path:/pages/old-faq"
              ? [{ node: { target } }]
              : [],
        },
      },
    }),
  );

describe("findShopifyRedirect", () => {
  it("follows an admin URL redirect, keeping the query", async () => {
    server.use(redirectTo("/policies/refund-policy"));
    expect(
      await findShopifyRedirect(
        "https://local.test/pages/old-faq?utm_source=email",
        "203.0.113.7",
      ),
    ).toBe("/policies/refund-policy?utm_source=email");
  });

  it("maps Shopify's collection-scoped product URLs to product pages", async () => {
    expect(
      await findShopifyRedirect(
        "https://local.test/collections/test-apparel/products/test-tee-3-option",
        "203.0.113.7",
      ),
    ).toBe("/products/test-tee-3-option");
  });

  it("never redirects off the site", async () => {
    server.use(redirectTo("https://elsewhere.test/x"));
    expect(
      await findShopifyRedirect(
        "https://local.test/pages/old-faq",
        "203.0.113.7",
      ),
    ).toBeNull();
  });

  it("leaves an unknown path a 404", async () => {
    server.use(redirectTo(null));
    expect(
      await findShopifyRedirect("https://local.test/nope", "203.0.113.7"),
    ).toBeNull();
  });
});

describe("redirect params on unknown paths", () => {
  it.each([
    "/.//example.com",
    "//example.com",
    "https://example.com",
    "/%2e//example.com",
    "/a/../\\example.com",
    "/\\example.com",
  ])(
    "never leave the site for ?redirect=%s or ?return_to=%s",
    async (target) => {
      server.use(redirectTo(null));
      for (const param of ["redirect", "return_to"]) {
        const location = await findShopifyRedirect(
          `https://local.test/nope?${param}=${encodeURIComponent(target)}`,
          "203.0.113.7",
        );
        if (location !== null) {
          expect(new URL(location, "https://local.test").origin).toBe(
            "https://local.test",
          );
          expect(location).not.toMatch(/^\/[/\\]/);
        }
      }
    },
  );

  it("follow a same-site ?redirect=", async () => {
    server.use(redirectTo(null));
    expect(
      await findShopifyRedirect(
        "https://local.test/nope?redirect=/shop",
        "203.0.113.7",
      ),
    ).toBe("/shop");
  });
});
