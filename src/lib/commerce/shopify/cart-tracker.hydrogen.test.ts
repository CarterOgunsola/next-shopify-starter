// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Cart, CartLine } from "../types";
import { createCartTracker } from "./storefront-analytics";

// Against Hydrogen's real trackCartAnalytics (not mocked): what the visitor
// arrives with and an expired cart are never reported; confirmed changes
// are, once each.

const usd = (amount: string) => ({ amount, currencyCode: "USD" as const });
const line = (id: string, quantity: number): CartLine =>
  ({
    id: `gid://shopify/CartLine/${id}`,
    quantity,
    attributes: [],
    parentLineId: null,
    planOptions: [],
    requiresSellingPlan: false,
    isGiftCard: false,
    merchandise: {
      id: `gid://shopify/ProductVariant/${id}`,
      title: `Variant ${id}`,
      sku: null,
      product: {
        id: `gid://shopify/Product/${id}`,
        handle: `product-${id}`,
        title: `Product ${id}`,
        vendor: "synthetic-store",
        productType: "",
      },
      image: null,
      selectedOptions: [],
    },
    sellingPlan: null,
    discounts: [],
    cost: {
      amountPerQuantity: usd("10.0"),
      compareAtAmountPerQuantity: null,
      totalAmount: usd(String(10 * quantity)),
    },
  }) as CartLine;
const cart = (id: string, updatedAt: string, lines: CartLine[]): Cart => ({
  analyticsId: `gid://shopify/Cart/${id}`,
  updatedAt,
  totalQuantity: lines.reduce((n, l) => n + l.quantity, 0),
  lines,
  cost: {
    subtotalAmount: usd("0"),
    totalAmount: usd("0"),
    checkoutChargeAmount: usd("0"),
  },
  note: null,
  attributes: [],
  discounts: [],
  discountCodes: [],
  giftCards: [],
  warnings: [],
});

const publish = vi.fn();
const events = () =>
  publish.mock.calls.map(([name, payload]) => {
    const p = payload as {
      currentLine?: { id: string };
      prevLine?: { id: string };
    };
    return [name, (p.currentLine ?? p.prevLine)?.id.split("/").at(-1)].filter(
      Boolean,
    );
  });

beforeEach(() => {
  localStorage.clear();
  publish.mockClear();
  (window as unknown as { Shopify: unknown }).Shopify = {
    analytics: { publish, getConfig: () => ({ shop: null, customData: {} }) },
  };
});
afterEach(() => {
  delete (window as unknown as { Shopify?: unknown }).Shopify;
});

describe("cart tracking with Hydrogen's tracker", () => {
  it("doesn't report the cart the visitor arrives with, then reports one change once", () => {
    const tracker = createCartTracker();
    tracker.start();
    tracker.reset(
      cart("a", "2026-10-09T10:00:00Z", [line("1", 1), line("2", 2)]),
    );
    expect(publish).not.toHaveBeenCalled();

    const changed = cart("a", "2026-10-09T10:01:00Z", [
      line("1", 2),
      line("2", 2),
    ]);
    tracker.report(changed);
    tracker.report(changed); // the same confirmed cart again
    expect(events()).toEqual([
      ["cart_updated"],
      ["product_added_to_cart", "1"],
    ]);
  });

  it("reports a removal as a removal", () => {
    const tracker = createCartTracker();
    tracker.start();
    tracker.reset(
      cart("a", "2026-10-09T10:00:00Z", [line("1", 1), line("2", 1)]),
    );
    tracker.report(cart("a", "2026-10-09T10:02:00Z", [line("1", 1)]));
    expect(events()).toEqual([
      ["cart_updated"],
      ["product_removed_from_cart", "2"],
    ]);
  });

  it("doesn't report an expired cart's lines as removed", () => {
    const tracker = createCartTracker();
    tracker.start();
    tracker.reset(cart("old", "2026-10-09T10:00:00Z", [line("1", 3)]));
    tracker.reset(null);
    expect(publish).not.toHaveBeenCalled();

    tracker.report(cart("new", "2026-10-09T11:00:00Z", [line("9", 1)]));
    expect(events()).toEqual([
      ["cart_updated"],
      ["product_added_to_cart", "9"],
    ]);
  });
});
