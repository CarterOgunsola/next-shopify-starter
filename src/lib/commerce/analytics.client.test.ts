import { describe, expect, it } from "vitest";
import { cartChanges } from "./analytics.client";
import { toShopifyConsent } from "./shopify/storefront-analytics";
import type { Cart, CartLine } from "./types";

const usd = (amount: string) => ({ amount, currencyCode: "USD" });

function line(id: string, quantity: number): CartLine {
  return {
    id,
    quantity,
    attributes: [],
    parentLineId: null,
    planOptions: [],
    requiresSellingPlan: false,
    isGiftCard: false,
    merchandise: {
      id: `gid://shopify/ProductVariant/${id}`,
      title: "Lemon",
      sku: null,
      product: {
        id: "gid://shopify/Product/42",
        handle: "electrolytes",
        title: "Electrolytes",
        vendor: "Synthetic Vendor",
        productType: "Supplement",
      },
      image: null,
      selectedOptions: [],
    },
    sellingPlan: null,
    discounts: [],
    cost: {
      amountPerQuantity: usd("24.0"),
      compareAtAmountPerQuantity: null,
      totalAmount: usd("24.0"),
    },
  };
}

const cart = (...lines: CartLine[]): Cart => ({
  analyticsId: "gid://shopify/Cart/c",
  updatedAt: "2026-10-07T12:00:00Z",
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

describe("cartChanges", () => {
  it("reports added and removed quantities per line", () => {
    const { added, removed } = cartChanges(
      cart(line("a", 1), line("b", 3)),
      cart(line("a", 3), line("c", 1)),
    );
    expect(added.map((i) => [i.item_variant, i.quantity])).toEqual([
      ["Lemon", 2],
      ["Lemon", 1],
    ]);
    expect(removed.map((i) => i.quantity)).toEqual([3]);
  });

  it("treats the first cart as all additions from an empty one", () => {
    const { added } = cartChanges(null, cart(line("a", 2)));
    expect(added).toEqual([
      {
        item_id: "42",
        item_name: "Electrolytes",
        item_variant: "Lemon",
        item_brand: "Synthetic Vendor",
        price: "24.0",
        quantity: 2,
        item_url: "/products/electrolytes?variant=a",
      },
    ]);
  });

  it("carries no customer data", () => {
    const { added } = cartChanges(null, cart(line("a", 1)));
    expect(Object.keys(added[0]).sort()).toEqual([
      "item_brand",
      "item_id",
      "item_name",
      "item_url",
      "item_variant",
      "price",
      "quantity",
    ]);
  });
});

describe("toShopifyConsent", () => {
  it("maps every purpose explicitly", () => {
    expect(
      toShopifyConsent({
        necessary: true,
        preferences: true,
        analytics: false,
        marketing: true,
        saleOfData: false,
        gpc: true,
        decided: true,
      }),
    ).toEqual({
      analytics: false,
      marketing: true,
      preferences: true,
      sale_of_data: false,
    });
  });
});
