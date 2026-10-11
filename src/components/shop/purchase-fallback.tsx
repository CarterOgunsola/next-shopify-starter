import type {
  ProductOption,
  SellingPlanGroup,
  VariantView,
} from "@/lib/commerce";
import { planOffers } from "@/lib/commerce/selling-plans";
import { VariantPrice } from "./variant-price";

// What the purchase panel shows before it runs in the browser, and to
// crawlers and visitors without JavaScript: the default variant's price and
// stock, and the options as text.
export function PurchaseFallback({
  options,
  view,
  sellingPlanGroups = [],
  requiresSellingPlan = false,
}: {
  options: ProductOption[];
  view: VariantView | null;
  sellingPlanGroups?: SellingPlanGroup[];
  requiresSellingPlan?: boolean;
}) {
  const variant = view?.variant ?? null;
  // A subscription-only product leads with its first plan's price.
  const plan =
    requiresSellingPlan && variant
      ? (planOffers(sellingPlanGroups, variant)[0] ?? null)
      : null;
  return (
    <section aria-label="Purchase">
      {options.map((option) => (
        <p key={option.name}>
          {option.name}: {option.values.map((value) => value.name).join(", ")}
        </p>
      ))}
      <VariantPrice variant={variant} plan={plan} />
      {plan && (
        <p>
          Subscription only: this product isn&apos;t sold as a one-time
          purchase.
        </p>
      )}
    </section>
  );
}
