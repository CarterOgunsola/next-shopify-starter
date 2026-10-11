import { describe, expect, it } from "vitest";
import { planOffers, planPriceText } from "./selling-plans";
import type { SellingPlanGroup, VariantState } from "./types";

const usd = (amount: string) => ({ amount, currencyCode: "USD" as const });
const plan = (id: string, name: string, over = {}) => ({
  id: `gid://shopify/SellingPlan/${id}`,
  name,
  description: null,
  recurring: true,
  introOrders: null,
  ...over,
});
const groups: SellingPlanGroup[] = [
  {
    name: "Subscribe",
    plans: [
      plan("1", "Every month"),
      plan("2", "Prepaid year"),
      plan("3", "Intro", { introOrders: 3 }),
      plan("4", "No price for this variant"),
    ],
  },
  { name: "Preorder", plans: [plan("5", "Preorder", { recurring: false })] },
];
const variant = {
  sellingPlanPrices: [
    {
      planId: "gid://shopify/SellingPlan/1",
      price: usd("31.5"),
      savingsPercent: 10,
    },
    {
      planId: "gid://shopify/SellingPlan/2",
      price: usd("19.96"),
      savingsPercent: 20,
      checkoutCharge: usd("239.52"),
    },
    {
      planId: "gid://shopify/SellingPlan/3",
      price: usd("9.0"),
      later: usd("10.0"),
      savingsPercent: 10,
      introSavingsPercent: 19,
    },
    { planId: "gid://shopify/SellingPlan/5", price: usd("24.95") },
  ],
} as unknown as VariantState;

describe("plan offers", () => {
  it("join plan terms with this variant's prices, leaving out unpriced plans", () => {
    expect(planOffers(groups, variant).map((o) => o.name)).toEqual([
      "Every month",
      "Prepaid year",
      "Intro",
      "Preorder",
    ]);
  });

  it("say the price per delivery, the saving, an intro price and a prepaid charge", () => {
    expect(planOffers(groups, variant).map(planPriceText)).toEqual([
      "$31.50 a delivery, save 10%",
      "$19.96 a delivery, save 20%, $239.52 charged today",
      "$9.00 a delivery for the first 3 orders, then $10.00, save 19% on your first 3 orders, then 10%",
      "$24.95",
    ]);
  });
});
