import type { VariantState } from "./types";

// Quantity limits for a variant: Shopify's quantity rule when it has one
// (B2B), otherwise 1 to 100 in steps of 1.
export function quantityBounds(rule: VariantState["quantityRule"]) {
  return {
    min: Math.max(rule?.min ?? 1, 1),
    step: Math.max(rule?.increment ?? 1, 1),
    max: rule?.max ?? 100,
  };
}

// The nearest allowed quantity: within the bounds and on the step.
export function clampQuantity(
  quantity: number,
  rule: VariantState["quantityRule"],
): number {
  const { min, step, max } = quantityBounds(rule);
  if (!Number.isFinite(quantity)) return min;
  const stepped = min + Math.round((quantity - min) / step) * step;
  const top = min + Math.floor((max - min) / step) * step;
  return Math.min(Math.max(stepped, min), top);
}
