import { formatMoney, type VariantState } from "@/lib/commerce";
import type { PlanOffer } from "@/lib/commerce/selling-plans";

// The price line. plan: for a subscription-only product, the chosen plan,
// whose price leads (there's no one-time price to buy at).
export function VariantPrice({
  variant,
  unavailable = false,
  plan = null,
}: {
  variant: VariantState | null;
  unavailable?: boolean;
  plan?: PlanOffer | null;
}) {
  if (unavailable) return <p>{"This combination isn't available."}</p>;
  if (!variant) return null;

  return (
    <p>
      {!plan && variant.compareAtPrice && (
        <>
          <s>
            <span className="sr-only">Regular price </span>
            {formatMoney(variant.compareAtPrice)}
          </s>{" "}
          <span className="sr-only">Sale price </span>
        </>
      )}
      {plan
        ? `${formatMoney(plan.price)} · ${plan.name}`
        : formatMoney(variant.price)}
      {variant.available !== undefined &&
        ` · ${variant.available ? "In stock" : "Sold out"}`}
    </p>
  );
}
