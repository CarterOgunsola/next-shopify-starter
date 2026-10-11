import { afterEach, describe, expect, it, vi } from "vitest";
import { klaviyoCommerceAdapter } from "./klaviyo-browser";

const item = {
  item_id: "42",
  item_name: "Test Tee",
  item_variant: "Black / XL / Regular",
  item_brand: "Synthetic Vendor",
  price: "38.00",
  quantity: 2,
  item_url: "/products/test-tee-3-option?variant=7",
  image_url: "https://cdn.shopify.com/s/files/tee.jpg",
};
const event = (name: "view_item" | "add_to_cart" | "view_cart") =>
  ({
    name,
    eventId: "e1",
    timestamp: 0,
    payload: { currency: "USD", items: [item] },
  }) as Parameters<ReturnType<typeof klaviyoCommerceAdapter>["send"]>[0];

afterEach(() => vi.unstubAllGlobals());

describe("klaviyoCommerceAdapter", () => {
  it("needs marketing consent and respects a sale opt-out", () => {
    const adapter = klaviyoCommerceAdapter();
    expect(adapter.category).toBe("marketing");
    expect(adapter.respectsSaleOptOut).toBe(true);
  });

  it("queues Viewed Product and the viewed item before klaviyo.js loads", () => {
    const window = { location: { origin: "https://shop.test" } } as {
      location: { origin: string };
      _learnq?: unknown[][];
    };
    vi.stubGlobal("window", window);
    klaviyoCommerceAdapter().send(event("view_item"));
    expect(window._learnq?.[0]).toEqual([
      "track",
      "Viewed Product",
      expect.objectContaining({
        ProductName: "Test Tee",
        ProductID: "42",
        Price: 38,
        URL: "https://shop.test/products/test-tee-3-option?variant=7",
        ImageURL: "https://cdn.shopify.com/s/files/tee.jpg",
      }),
    ]);
    expect(window._learnq?.[1][0]).toBe("trackViewedItem");
  });

  it("sends Added to Cart with its value through klaviyo.js once loaded", () => {
    const track = vi.fn(async () => {});
    vi.stubGlobal("window", {
      location: { origin: "https://shop.test" },
      klaviyo: { track },
    });
    klaviyoCommerceAdapter().send(event("add_to_cart"));
    expect(track).toHaveBeenCalledWith(
      "Added to Cart",
      expect.objectContaining({ $value: 76, AddedItemQuantity: 2 }),
    );
  });

  it("ignores events Shopify's integration already covers", () => {
    const track = vi.fn();
    vi.stubGlobal("window", { location: { origin: "x" }, klaviyo: { track } });
    klaviyoCommerceAdapter().send(event("view_cart"));
    expect(track).not.toHaveBeenCalled();
  });
});
