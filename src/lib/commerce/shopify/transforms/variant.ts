import { lowStock } from "../../badges";
import type { OptionState, VariantState, VariantView } from "../../types";
import { combinationKey, decodeEncodedVariants } from "../encoded-variants";
import type { VariantViewData } from "../operations/variants";
import { isPlaceholderOption } from "./product";

type VariantData = NonNullable<
  VariantViewData["selectedOrFirstAvailableVariant"]
>;

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

// requested: the values the visitor chose. Each value's exists and
// available flags say whether it goes with those choices (and, for options
// they didn't choose, with the variant Shopify picked), so a sold-out or
// missing label never comes from a fallback variant they didn't ask for.
export function toVariantView(
  product: Pick<
    VariantViewData,
    | "id"
    | "options"
    | "encodedVariantExistence"
    | "encodedVariantAvailability"
    | "selectedOrFirstAvailableVariant"
  >,
  requested: { name: string; value: string }[] = [],
): VariantView {
  const variant = product.selectedOrFirstAvailableVariant ?? null;
  const existing = decodeEncodedVariants(product.encodedVariantExistence);
  const available = decodeEncodedVariants(product.encodedVariantAvailability);

  // Index of the selected value for each option, in Shopify's option order.
  const picked = product.options.map((option) =>
    option.optionValues.findIndex(
      (value) =>
        value.name ===
        variant?.selectedOptions.find((o) => o.name === option.name)?.value,
    ),
  );
  // What the flags are relative to: the visitor's value where they chose
  // one, otherwise Shopify's pick.
  const selected = product.options.map((option, i) => {
    const wanted = requested.find((r) => same(r.name, option.name));
    const index = wanted
      ? option.optionValues.findIndex((v) => same(v.name, wanted.value))
      : -1;
    return index >= 0 ? index : picked[i];
  });

  // Does any variant have this value for this option, with the other
  // options as currently selected?
  const matches = (
    combinations: number[][],
    optionIndex: number,
    valueIndex: number,
  ) =>
    combinations.some((combination) =>
      selected.every((selectedIndex, index) =>
        index === optionIndex
          ? combination[index] === valueIndex
          : selectedIndex < 0 || combination[index] === selectedIndex,
      ),
    );

  const options: OptionState[] = product.options.flatMap((option, i) =>
    isPlaceholderOption(option)
      ? []
      : [
          {
            name: option.name,
            values: option.optionValues.map((value, j) => ({
              name: value.name,
              selected: picked[i] === j,
              exists: matches(existing, i, j),
              available: matches(available, i, j),
            })),
          },
        ],
  );

  return {
    productId: product.id,
    variant: variant ? toVariantState(variant) : null,
    options,
  };
}

// Whole percent off the one-time price, never rounded up (a price 14.99%
// lower saves 14%). price and compareAtPrice are on the same basis (for a
// prepaid plan, all its deliveries); the epsilon keeps an exact 20% (which
// floating point makes 19.999...) at 20.
export function savingPercent(adjustment: {
  price: { amount: string };
  compareAtPrice: { amount: string };
}): number {
  const price = Number(adjustment.price.amount);
  const compareAt = Number(adjustment.compareAtPrice.amount);
  if (!(compareAt > 0) || !(price < compareAt)) return 0;
  return Math.floor((1 - price / compareAt) * 100 + 1e-9);
}

export function toVariantState(variant: VariantData): VariantState {
  const compareAt = variant.compareAtPrice;
  return {
    id: variant.id,
    title: variant.title,
    sku: variant.sku || null,
    selectedOptions: variant.selectedOptions.map(({ name, value }) => ({
      name,
      value,
    })),
    available: variant.availableForSale,
    ...(lowStock(variant) ? { lowStock: lowStock(variant) } : {}),
    price: variant.price,
    // Shopify allows a compare-at price at or below the price; only a higher
    // one is a discount worth showing.
    ...(compareAt && Number(compareAt.amount) > Number(variant.price.amount)
      ? { compareAtPrice: compareAt }
      : {}),
    sellingPlanPrices: variant.sellingPlanAllocations.nodes.flatMap(
      (allocation) => {
        const [first, second] = allocation.priceAdjustments;
        if (!first) return [];
        const charge = allocation.checkoutChargeAmount;
        // The ongoing saving leads; an introductory one is said as such.
        const ongoing = savingPercent(allocation.priceAdjustments.at(-1)!);
        const intro = second ? savingPercent(first) : 0;
        return [
          {
            planId: allocation.sellingPlan.id,
            price: first.perDeliveryPrice,
            ...(ongoing > 0 ? { savingsPercent: ongoing } : {}),
            ...(intro > 0 && intro !== ongoing
              ? { introSavingsPercent: intro }
              : {}),
            ...(second &&
            second.perDeliveryPrice.amount !== first.perDeliveryPrice.amount
              ? { later: second.perDeliveryPrice }
              : {}),
            ...(Number(charge.amount) !== Number(first.perDeliveryPrice.amount)
              ? { checkoutCharge: charge }
              : {}),
          },
        ];
      },
    ),
    ...(variant.quantityRule
      ? {
          quantityRule: {
            min: variant.quantityRule.minimum,
            ...(variant.quantityRule.maximum != null
              ? { max: variant.quantityRule.maximum }
              : {}),
            increment: variant.quantityRule.increment,
          },
        }
      : {}),
  };
}

// The existing combination closest to what the visitor asked for: each
// requested value is kept when some variant still has it alongside the
// values kept before it (earlier options first), the rest are filled in,
// preferring an available variant. ?color=forest&fit=relaxed on a product
// with no Forest Relaxed keeps Forest, not Shopify's first available
// variant. null when nothing exists.
export function closestCombination(
  product: Pick<
    VariantViewData,
    "options" | "encodedVariantExistence" | "encodedVariantAvailability"
  >,
  wanted: { name: string; value: string }[],
): { name: string; value: string }[] | null {
  let candidates = decodeEncodedVariants(product.encodedVariantExistence);
  if (candidates.length === 0) return null;
  product.options.forEach((option, i) => {
    const requested = wanted.find((w) => same(w.name, option.name));
    const index = requested
      ? option.optionValues.findIndex((v) => same(v.name, requested.value))
      : -1;
    if (index < 0) return;
    const keeping = candidates.filter((c) => c[i] === index);
    if (keeping.length) candidates = keeping;
  });
  const available = new Set(
    decodeEncodedVariants(product.encodedVariantAvailability).map(
      combinationKey,
    ),
  );
  const chosen =
    candidates.find((c) => available.has(combinationKey(c))) ?? candidates[0];
  return product.options.map((option, i) => ({
    name: option.name,
    value: option.optionValues[chosen[i]]?.name ?? "",
  }));
}
