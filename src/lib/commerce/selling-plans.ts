import { formatMoney } from "./money";
import type { SellingPlanGroup, SellingPlanPrice, VariantState } from "./types";

// A selling plan as the buyer can take it for one variant: its terms
// (content) joined with its prices (buyer-specific). Plans without a price
// for the variant aren't offered.
export type PlanOffer = SellingPlanGroup["plans"][number] &
  Omit<SellingPlanPrice, "planId">;

export function planOffers(
  groups: SellingPlanGroup[],
  variant: VariantState,
): PlanOffer[] {
  return groups.flatMap((group) =>
    group.plans.flatMap((plan) => {
      const price = variant.sellingPlanPrices.find((p) => p.planId === plan.id);
      if (!price) return [];
      const { planId: _, ...prices } = price;
      return [{ ...plan, ...prices }];
    }),
  );
}

// "$31.50 a delivery", "$9.00 for the first 3 orders, then $10.00",
// "save 10%", "$239.52 charged today": the plan's price, in words.
export function planPriceText(offer: PlanOffer): string {
  const price = formatMoney(offer.price);
  const each = offer.recurring ? `${price} a delivery` : price;
  const intro =
    offer.later && offer.introOrders
      ? `${each} for the first ${offer.introOrders} ${offer.introOrders === 1 ? "order" : "orders"}, then ${formatMoney(offer.later)}`
      : each;
  const orders = (n: number) => `${n} ${n === 1 ? "order" : "orders"}`;
  const savings =
    offer.introSavingsPercent && offer.introOrders
      ? `save ${offer.introSavingsPercent}% on your first ${orders(offer.introOrders)}${offer.savingsPercent ? `, then ${offer.savingsPercent}%` : ""}`
      : offer.savingsPercent
        ? `save ${offer.savingsPercent}%`
        : null;
  return [
    intro,
    savings,
    offer.checkoutCharge
      ? `${formatMoney(offer.checkoutCharge)} charged today`
      : null,
  ]
    .filter(Boolean)
    .join(", ");
}
