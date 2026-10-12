import { HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";
import { publicContext } from "./audience";
import {
  getCollection,
  getProductContent,
  getProductRecommendations,
  getShopPolicy,
  listShopPolicies,
  loadShopAnalyticsConfig,
} from "./catalog.server";
import tee from "./testing/fixtures/ProductContent.test-tee-3-option.json";
import { published, replay, server, shopify } from "./testing/msw";

const cache = vi.hoisted(() => ({ life: vi.fn() }));
vi.mock("next/cache", () => ({ cacheLife: cache.life, cacheTag: () => {} }));

describe("per-handle catalog reads", () => {
  it("don't ask Shopify about a handle that isn't published", async () => {
    let asked = 0;
    server.use(
      ...published({ products: ["test-tee-3-option"] }),
      shopify.query("ProductContent", () => {
        asked++;
        return HttpResponse.json({ data: { product: null } });
      }),
    );
    expect(await getProductContent(publicContext(), "a1")).toBeNull();
    expect(asked).toBe(0);
  });

  it("read a published product", async () => {
    server.use(
      ...published({ products: ["test-tee-3-option"] }),
      replay("ProductContent", tee),
    );
    const product = await getProductContent(
      publicContext(),
      "test-tee-3-option",
    );
    expect(product?.handle).toBe("test-tee-3-option");
  });

  it("refresh a product hourly, since stock changes send no webhook", async () => {
    server.use(
      ...published({ products: ["test-tee-3-option"] }),
      replay("ProductContent", tee),
    );
    cache.life.mockClear();
    await getProductContent(publicContext(), "test-tee-3-option");
    expect(cache.life).toHaveBeenCalledWith("hours");
    expect(cache.life).not.toHaveBeenCalledWith("days");
  });

  it("don't ask Shopify about an unpublished collection", async () => {
    let asked = 0;
    server.use(
      ...published({ collections: ["test-apparel"] }),
      shopify.query("CollectionListing", () => {
        asked++;
        return HttpResponse.json({ data: { collection: null } });
      }),
    );
    expect(await getCollection(publicContext(), "made-up")).toBeNull();
    expect(asked).toBe(0);
  });
});

describe("loadShopAnalyticsConfig", () => {
  it("returns null instead of failing when Shopify is unreachable", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    server.use(shopify.query("ShopId", () => HttpResponse.error()));
    expect(await loadShopAnalyticsConfig(publicContext())).toBeNull();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("returns null with a warning for an empty shop id", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    server.use(
      shopify.query("ShopId", () =>
        HttpResponse.json({ data: { shop: { id: "" } } }),
      ),
    );
    expect(await loadShopAnalyticsConfig(publicContext())).toBeNull();
    expect(String(warn.mock.calls[0][0])).toContain("no shop id");
    warn.mockRestore();
  });
});

describe("shop policies", () => {
  it("lists the policies that are set, sanitized, sales policies first", async () => {
    const policy = (handle: string, title: string, body: string) => ({
      handle,
      title,
      body,
    });
    server.use(
      shopify.query("ShopPolicies", () =>
        HttpResponse.json({
          data: {
            shop: {
              privacyPolicy: policy(
                "privacy-policy",
                "Privacy policy",
                "<p>P</p>",
              ),
              refundPolicy: policy(
                "refund-policy",
                "Refund policy",
                "<h1>Returns</h1><script>alert(1)</script><p>30 days</p>",
              ),
              shippingPolicy: null,
              termsOfService: policy(
                "terms-of-service",
                "Terms of service",
                "  ",
              ),
              termsOfSale: null,
              subscriptionPolicy: policy(
                "subscription-policy",
                "Subscription policy",
                "<p>S</p>",
              ),
            },
          },
        }),
      ),
    );
    const policies = await listShopPolicies(publicContext());
    expect(policies.map((p) => p.handle)).toEqual([
      "refund-policy",
      "subscription-policy",
      "privacy-policy",
    ]);
    expect(policies[0].bodyHtml).toBe("<h2>Returns</h2><p>30 days</p>");
    expect(await getShopPolicy(publicContext(), "shipping-policy")).toBeNull();
  });
});

describe("getProductRecommendations", () => {
  const card = (handle: string) => ({
    id: `gid://shopify/Product/${handle}`,
    handle,
    title: handle,
    availableForSale: true,
    trackingParameters: null,
    featuredImage: null,
    priceRange: {
      minVariantPrice: { amount: "1.0", currencyCode: "USD" },
      maxVariantPrice: { amount: "1.0", currencyCode: "USD" },
    },
    publishedAt: "2020-01-01T00:00:00Z",
    merchantBadges: null,
    requiresSellingPlan: false,
    reviewRating: null,
    reviewCount: null,
    isGiftCard: false,
    variants: { pageInfo: { hasNextPage: false }, nodes: [] },
  });

  it("lists up to four related products, never the product itself", async () => {
    server.use(
      ...published({ products: ["test-tee-3-option"] }),
      shopify.query("ProductRecommendations", () =>
        HttpResponse.json({
          data: {
            productRecommendations: [
              "test-tee-3-option",
              "a",
              "b",
              "c",
              "d",
              "e",
            ].map(card),
          },
        }),
      ),
    );
    const related = await getProductRecommendations(
      publicContext(),
      "test-tee-3-option",
    );
    expect(related.map((p) => p.handle)).toEqual(["a", "b", "c", "d"]);
  });

  it("refreshes daily while a product shows New, otherwise keeps until a change", async () => {
    const related = (publishedAt: string) => {
      server.use(
        ...published({ products: ["test-tee-3-option"] }),
        shopify.query("ProductRecommendations", () =>
          HttpResponse.json({
            data: { productRecommendations: [{ ...card("a"), publishedAt }] },
          }),
        ),
      );
      cache.life.mockClear();
      return getProductRecommendations(publicContext(), "test-tee-3-option");
    };
    await related(new Date().toISOString());
    expect(cache.life).toHaveBeenLastCalledWith("days");
    await related("2020-01-01T00:00:00Z");
    expect(cache.life).not.toHaveBeenCalledWith("days");
  });

  it("asks for the intent wanted and leaves gift cards out", async () => {
    let intent: unknown;
    server.use(
      ...published({ products: ["test-electrolytes"] }),
      shopify.query("ProductRecommendations", ({ variables }) => {
        intent = variables.intent;
        return HttpResponse.json({
          data: {
            productRecommendations: [
              card("test-subscription-only"),
              { ...card("test-gift-card"), isGiftCard: true },
            ],
          },
        });
      }),
    );
    const pairs = await getProductRecommendations(
      publicContext(),
      "test-electrolytes",
      "COMPLEMENTARY",
    );
    expect(intent).toBe("COMPLEMENTARY");
    expect(pairs.map((p) => p.handle)).toEqual(["test-subscription-only"]);
  });

  it("is empty when Shopify can't be reached", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    server.use(
      ...published({ products: ["test-tee-3-option"] }),
      shopify.query("ProductRecommendations", () => HttpResponse.error()),
    );
    expect(
      await getProductRecommendations(publicContext(), "test-tee-3-option"),
    ).toEqual([]);
  });
});

describe("Shopify analytics config", () => {
  it("carries the store's market from the Storefront API", async () => {
    server.use(
      shopify.query("ShopId", () =>
        HttpResponse.json({ data: { shop: { id: "gid://shopify/Shop/7" } } }),
      ),
      shopify.query("ShopLocalization", () =>
        HttpResponse.json({
          data: {
            localization: {
              country: { isoCode: "CA", currency: { isoCode: "CAD" } },
              language: { isoCode: "FR" },
            },
          },
        }),
      ),
    );
    const config = await loadShopAnalyticsConfig(publicContext());
    expect(config?.shopId).toBe("7");
    expect(config?.i18n).toEqual({
      country: "CA",
      language: "FR",
      currency: "CAD",
    });
  });
});
