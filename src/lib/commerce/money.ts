import type { Money } from "./types";

// Formatting only. Totals, discounts and tax come from Shopify; we never add
// or multiply money.
export function formatMoney(money: Money, locale = "en-US"): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: money.currencyCode,
  }).format(Number(money.amount));
}

// The price a product can actually be bought at: for a subscription-only
// product, its lowest plan price (there's no one-time purchase); otherwise
// the variant's price. A comparison, not arithmetic.
export function purchasePrice(
  requiresSellingPlan: boolean,
  price: Money,
  planPrices: Money[],
): Money {
  if (!requiresSellingPlan || planPrices.length === 0) return price;
  return planPrices.reduce((low, next) =>
    Number(next.amount) < Number(low.amount) ? next : low,
  );
}
