import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { VariantView } from "@/lib/commerce";
import { PurchaseFallback } from "./purchase-fallback";

const usd = (amount: string) => ({ amount, currencyCode: "USD" as const });
const view = {
  variant: {
    id: "gid://shopify/ProductVariant/1",
    title: "Default Title",
    sku: null,
    selectedOptions: [],
    available: true,
    price: usd("35.0"),
    sellingPlanPrices: [
      {
        planId: "gid://shopify/SellingPlan/1",
        price: usd("31.5"),
        savingsPercent: 10,
      },
    ],
  },
  options: [],
} as unknown as VariantView;
const groups = [
  {
    name: "Subscribe and save",
    plans: [
      {
        id: "gid://shopify/SellingPlan/1",
        name: "Every month",
        description: null,
        recurring: true,
        introOrders: null,
      },
    ],
  },
];

describe("PurchaseFallback", () => {
  it("leads a subscription-only product with its plan price, before the page runs", () => {
    const html = renderToStaticMarkup(
      <PurchaseFallback
        options={[]}
        view={view}
        sellingPlanGroups={groups}
        requiresSellingPlan
      />,
    );
    expect(html).toContain("$31.50 · Every month · In stock");
    expect(html).not.toContain("$35.00");
    expect(html).toContain("Subscription only");
  });

  it("shows the one-time price otherwise", () => {
    const html = renderToStaticMarkup(
      <PurchaseFallback options={[]} view={view} sellingPlanGroups={groups} />,
    );
    expect(html).toContain("$35.00 · In stock");
  });
});
