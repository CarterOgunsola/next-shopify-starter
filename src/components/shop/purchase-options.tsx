import {
  PLACEHOLDER_MARKER,
  PLAN_DESCRIPTION_FALLBACK,
  SUBSCRIPTION_POLICY_PATH,
  SUBSCRIPTION_TERMS,
} from "@/lib/commerce/compliance";
import { useId } from "react";
import {
  formatMoney,
  type SellingPlanGroup,
  type VariantState,
} from "@/lib/commerce";
import {
  type PlanOffer,
  planOffers,
  planPriceText,
} from "@/lib/commerce/selling-plans";

// One-time purchase, Subscribe (one choice, with the delivery frequency in
// a select), or a plan that isn't a subscription (preorder), each with its
// price for this variant: per delivery, the saving, an introductory price
// and what's charged today when that differs.
export function PurchaseOptions({
  groups,
  variant,
  planId,
  requiresPlan,
  onChange,
}: {
  groups: SellingPlanGroup[];
  variant: VariantState;
  planId: string | null;
  // Subscription-only products don't offer a one-time purchase.
  requiresPlan: boolean;
  onChange: (planId: string | null) => void;
}) {
  const id = useId();
  const offers = planOffers(groups, variant);
  if (offers.length === 0) return null;
  const subscriptions = offers.filter((offer) => offer.recurring);
  const others = offers.filter((offer) => !offer.recurring);
  const chosen = subscriptions.find((offer) => offer.id === planId) ?? null;
  const best = Math.max(0, ...subscriptions.map((o) => o.savingsPercent ?? 0));
  const savesEqually = subscriptions.every(
    (o) => (o.savingsPercent ?? 0) === best,
  );

  return (
    <fieldset aria-describedby={requiresPlan ? `${id}-only` : undefined}>
      <legend>Purchase options</legend>
      {requiresPlan ? (
        <p id={`${id}-only`}>
          Subscription only: this product isn&apos;t sold as a one-time
          purchase.
        </p>
      ) : (
        <label>
          <input
            type="radio"
            name={`${id}-option`}
            checked={planId === null}
            onChange={() => onChange(null)}
          />
          One-time purchase: {formatMoney(variant.price)}
        </label>
      )}
      {subscriptions.length > 0 && (
        <>
          <label>
            <input
              type="radio"
              name={`${id}-option`}
              checked={chosen !== null}
              onChange={() => onChange(subscriptions[0].id)}
            />
            Subscribe
            {best > 0 && ` and save ${savesEqually ? "" : "up to "}${best}%`}
          </label>
          {chosen && (
            <>
              <Frequency
                id={id}
                offers={subscriptions}
                chosen={chosen}
                onChange={onChange}
              />
              <p id={`${id}-terms`}>
                {!SUBSCRIPTION_TERMS.approved && (
                  <strong>[{PLACEHOLDER_MARKER}] </strong>
                )}
                {SUBSCRIPTION_TERMS.text}{" "}
                <a href={SUBSCRIPTION_POLICY_PATH}>Subscription policy</a>
              </p>
            </>
          )}
        </>
      )}
      {others.map((offer) => (
        <label key={offer.id}>
          <input
            type="radio"
            name={`${id}-option`}
            checked={planId === offer.id}
            onChange={() => onChange(offer.id)}
            aria-describedby={
              offer.description ? `${id}-${offer.id}-about` : undefined
            }
          />
          {offer.name}: {planPriceText(offer)}
          {offer.description && (
            <span id={`${id}-${offer.id}-about`}> {offer.description}</span>
          )}
        </label>
      ))}
    </fieldset>
  );
}

// How often a subscription delivers, with each plan's price, and the
// chosen plan's price and description.
function Frequency({
  id,
  offers,
  chosen,
  onChange,
}: {
  id: string;
  offers: PlanOffer[];
  chosen: PlanOffer;
  onChange: (planId: string) => void;
}) {
  return (
    <p>
      <label htmlFor={`${id}-frequency`}>Delivery frequency</label>{" "}
      <select
        id={`${id}-frequency`}
        value={chosen.id}
        onChange={(event) => onChange(event.target.value)}
        aria-describedby={`${id}-frequency-price ${id}-terms`}
      >
        {offers.map((offer) => (
          <option key={offer.id} value={offer.id}>
            {offer.name}
          </option>
        ))}
      </select>{" "}
      <span id={`${id}-frequency-price`}>
        {planPriceText(chosen)}.{" "}
        {chosen.description ?? (
          <>
            {!PLAN_DESCRIPTION_FALLBACK.approved && (
              <strong>[{PLACEHOLDER_MARKER}] </strong>
            )}
            {PLAN_DESCRIPTION_FALLBACK.text}
          </>
        )}
      </span>
    </p>
  );
}
