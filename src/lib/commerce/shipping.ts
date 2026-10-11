import type { Money } from "./types";

// Free-shipping progress for display. Shopify decides real shipping at
// checkout; this only compares its cart subtotal with the configured
// threshold, in whole cents to avoid floating-point drift.

function toCents(amount: string): number {
  const [whole, fraction = ""] = amount.split(".");
  return Number(whole) * 100 + Number(fraction.padEnd(2, "0").slice(0, 2));
}

function fromCents(cents: number): string {
  return `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, "0")}`;
}

export type FreeShippingProgress = {
  qualified: boolean;
  remaining: Money;
  // 0 to 100.
  percent: number;
};

export function freeShippingProgress(
  subtotal: Money,
  threshold: string,
): FreeShippingProgress {
  const have = toCents(subtotal.amount);
  const need = toCents(threshold);
  const remaining = Math.max(need - have, 0);
  return {
    qualified: remaining === 0,
    remaining: {
      amount: fromCents(remaining),
      currencyCode: subtotal.currencyCode,
    },
    percent: need > 0 ? Math.min(Math.floor((have / need) * 100), 100) : 100,
  };
}
