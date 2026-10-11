import { afterEach, describe, expect, it, vi } from "vitest";
import type { Cart } from "../types";

type Store = {
  getState(): { data: { id: string; lines: { nodes: unknown[] } } };
  subscribe(listener: (state: unknown) => void): () => void;
};
const tracked = vi.hoisted(() => ({
  starts: [] as { baseline: string; store: unknown }[],
  stops: 0,
}));
vi.mock("@shopify/hydrogen", async (original) => ({
  ...(await original<object>()),
  trackCartAnalytics: (store: Store) => {
    tracked.starts.push({ baseline: store.getState().data.id, store });
    return () => {
      tracked.stops++;
    };
  },
}));

const { createCartTracker } = await import("./storefront-analytics");

const cart = (id: string): Cart => ({
  analyticsId: id,
  updatedAt: "2026-10-07T12:00:00Z",
  totalQuantity: 0,
  lines: [],
  cost: {
    subtotalAmount: { amount: "0", currencyCode: "USD" },
    totalAmount: { amount: "0", currencyCode: "USD" },
    checkoutChargeAmount: { amount: "0", currencyCode: "USD" },
  },
  note: null,
  attributes: [],
  discounts: [],
  discountCodes: [],
  giftCards: [],
  warnings: [],
});

afterEach(() => {
  tracked.starts = [];
  tracked.stops = 0;
  vi.unstubAllGlobals();
});

describe("createCartTracker", () => {
  it("starts only once the visitor's cart is the baseline", () => {
    vi.stubGlobal("window", { Shopify: { analytics: {} } });
    const tracker = createCartTracker();
    tracker.start();
    expect(tracked.starts).toHaveLength(0);
    tracker.reset(cart("gid://shopify/Cart/arrived"));
    expect(tracked.starts.map((s) => s.baseline)).toEqual([
      "gid://shopify/Cart/arrived",
    ]);
  });

  it("restarts from an empty baseline when the cart expires", () => {
    vi.stubGlobal("window", { Shopify: { analytics: {} } });
    const tracker = createCartTracker();
    tracker.start();
    tracker.reset(cart("gid://shopify/Cart/old"));
    tracker.reset(null);
    expect(tracked.stops).toBe(1);
    expect(tracked.starts.map((s) => s.baseline)).toEqual([
      "gid://shopify/Cart/old",
      "",
    ]);
  });
});
