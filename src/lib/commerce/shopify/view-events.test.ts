// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createCartTracker,
  publishCartViewed,
  publishCollectionViewed,
  publishPageViewed,
  publishProductViewed,
} from "./storefront-analytics";
import type { Cart } from "../types";

// Shopify's analytics script reports every event with the page's own
// location, query included, so on a page whose URL holds what the visitor
// typed or picked, no event goes to Shopify at all. Elsewhere each view
// event carries a cleaned URL.
const publish = vi.fn();
const at = (path: string) => window.history.replaceState(null, "", path);

afterEach(() => {
  publish.mockClear();
  at("/");
});

function withBus() {
  (window as unknown as { Shopify: unknown }).Shopify = {
    analytics: { publish, getConfig: () => ({ shop: null, customData: {} }) },
  };
}

describe("Shopify events", () => {
  it.each([
    "/search?q=uniqueterm123",
    "/search",
    "/collections/apparel?filter.v.option.color=Navy",
    "/collections/apparel?FILTER.p.vendor=x&utm_source=email",
  ])("aren't sent from %s", (path) => {
    withBus();
    at(path);
    publishPageViewed();
    publishCollectionViewed({ id: "gid://shopify/Collection/1", handle: "c" });
    publishCartViewed(null);
    expect(publish).not.toHaveBeenCalled();
  });

  it("send the product's price as Money, as Hydrogen's payload has it", () => {
    withBus();
    at("/products/tee");
    publishProductViewed(
      {
        id: "gid://shopify/Product/1",
        title: "Tee",
        vendor: "synthetic-store",
        productType: "Shirt",
      },
      {
        id: "gid://shopify/ProductVariant/2",
        title: "Navy / M",
        sku: "SKU-2",
        price: { amount: "38.0", currencyCode: "USD" },
      } as Parameters<typeof publishProductViewed>[1],
    );
    expect(publish).toHaveBeenCalledWith(
      "product_viewed",
      expect.objectContaining({
        products: [
          expect.objectContaining({
            id: "gid://shopify/Product/1",
            variantId: "gid://shopify/ProductVariant/2",
            price: { amount: "38.0", currencyCode: "USD" },
            quantity: 1,
          }),
        ],
      }),
    );
  });

  it("carry a cleaned URL elsewhere", () => {
    withBus();
    at("/collections/apparel?sort_by=price-ascending&utm_source=email");
    publishPageViewed();
    publishCollectionViewed({ id: "gid://shopify/Collection/1", handle: "c" });
    expect(publish).toHaveBeenCalledTimes(2);
    for (const [, payload] of publish.mock.calls) {
      expect((payload as { url: string }).url).toBe(
        "http://localhost:3000/collections/apparel?utm_source=email".replace(
          "http://localhost:3000",
          window.location.origin,
        ),
      );
    }
  });

  it("don't report a cart change made on a search page", () => {
    withBus();
    localStorage.clear();
    const usd = (amount: string) => ({ amount, currencyCode: "USD" });
    const cart = (updatedAt: string, quantity: number) =>
      ({
        analyticsId: "gid://shopify/Cart/c1",
        updatedAt,
        totalQuantity: quantity,
        lines: [
          {
            id: "gid://shopify/CartLine/1",
            quantity,
            merchandise: {
              id: "gid://shopify/ProductVariant/1",
              title: "V",
              sku: null,
              product: {
                id: "gid://shopify/Product/1",
                title: "P",
                vendor: "s",
                productType: "",
                handle: "p",
              },
            },
            cost: { amountPerQuantity: usd("10.0") },
          },
        ],
        cost: {
          subtotalAmount: usd("10"),
          totalAmount: usd("10"),
          checkoutChargeAmount: usd("10"),
        },
      }) as unknown as Cart;
    const tracker = createCartTracker();
    tracker.start();
    tracker.reset(cart("2026-10-09T10:00:00Z", 1));
    at("/search?q=uniqueterm123");
    tracker.report(cart("2026-10-09T10:01:00Z", 2));
    expect(publish).not.toHaveBeenCalled();
    // Back on a plain page, the next change is measured from that cart.
    at("/products/p");
    tracker.report(cart("2026-10-09T10:02:00Z", 3));
    expect(publish.mock.calls.map(([name]) => name)).toEqual([
      "cart_updated",
      "product_added_to_cart",
    ]);
  });
});
