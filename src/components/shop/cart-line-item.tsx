"use client";

import Link from "next/link";
import { useId, useState } from "react";
import { formatMoney, type CartLine } from "@/lib/commerce";
import { lineProductUrl, variantLabel } from "@/lib/commerce/cart-view";
import { clampQuantity, quantityBounds } from "@/lib/commerce/quantity";
import { ShopifyImage } from "./shopify-image";

export function CartLineItem({
  line,
  disabled,
  onQuantity,
  onPlan,
  onRemove,
}: {
  line: CartLine;
  disabled: boolean;
  onQuantity: (quantity: number) => void;
  onPlan: (planId: string | null) => void;
  onRemove: () => void;
}) {
  const id = useId();
  // Shopify's quantity rule for the variant (B2B), or 1 to 100. Below the
  // minimum, the line is removed with Remove.
  const rule = line.merchandise.quantityRule;
  const bounds = quantityBounds(rule);
  const product = line.merchandise.product.title;
  const variant = variantLabel(line);
  // Subscribe and save switches to a subscription that saves (the first
  // one; a recurring plan without a saving only if there's none). Not
  // offered when the product has no subscription.
  const subscribeTo =
    line.planOptions.find((plan) => plan.recurring && plan.saves) ??
    line.planOptions.find((plan) => plan.recurring) ??
    null;
  const current =
    line.planOptions.find((plan) => plan.id === line.sellingPlan?.id) ?? null;
  // "and save" only when the plan it switches to does.
  const subscribeLabel = subscribeTo?.saves
    ? "Subscribe and save"
    : "Subscribe";
  // Typed quantities apply on blur or Enter, not on every keystroke.
  const [draft, setDraft] = useState<string | null>(null);

  const commit = () => {
    if (draft === null) return;
    const quantity = Number.parseInt(draft, 10);
    setDraft(null);
    if (!Number.isInteger(quantity)) return;
    const next = quantity <= 0 ? 0 : clampQuantity(quantity, rule);
    if (next !== line.quantity) onQuantity(next);
  };

  return (
    <li>
      {line.merchandise.image && (
        <ShopifyImage
          src={line.merchandise.image.url}
          // Decorative: the product's name is the link next to it.
          alt=""
          width={96}
          height={96}
        />
      )}
      <p>
        <Link href={lineProductUrl(line)}>{product}</Link>
        {variant && <> ({variant})</>}
      </p>
      {/* Details the buyer entered (gift card recipient); Shopify's own
          "__" attributes stay hidden. */}
      {line.attributes.some((a) => !a.key.startsWith("_")) && (
        <dl aria-label={`Details for ${product}`}>
          {line.attributes
            .filter((a) => !a.key.startsWith("_"))
            .map((a) => (
              <div key={a.key}>
                <dt>{a.key}</dt>
                <dd>{a.value}</dd>
              </div>
            ))}
        </dl>
      )}
      {line.planOptions.length > 0 && (subscribeTo || line.sellingPlan) ? (
        // Subscribe and save from the cart (unless the product is plan-only,
        // when only the frequency can change), with each plan's price.
        <>
          {!line.requiresSellingPlan && subscribeTo && (
            <p>
              <label>
                <input
                  type="checkbox"
                  aria-label={`${subscribeLabel} on ${product}`}
                  checked={line.sellingPlan !== null}
                  disabled={disabled}
                  onChange={(event) =>
                    onPlan(event.target.checked ? subscribeTo.id : null)
                  }
                />{" "}
                {subscribeLabel}
              </label>
            </p>
          )}
          {line.sellingPlan && (
            <p>
              <label htmlFor={`${id}-plan`}>Delivery frequency</label>{" "}
              <select
                id={`${id}-plan`}
                aria-label={`Delivery frequency for ${product}`}
                value={line.sellingPlan.id}
                disabled={disabled}
                onChange={(event) => onPlan(event.target.value)}
              >
                {line.planOptions.map((plan) => (
                  <option key={plan.id} value={plan.id}>
                    {plan.name} ({formatMoney(plan.price)} each a delivery)
                  </option>
                ))}
              </select>
            </p>
          )}
        </>
      ) : (
        line.sellingPlan && <p>{line.sellingPlan.name}</p>
      )}
      <p>
        {line.cost.compareAtAmountPerQuantity && (
          <>
            <s>
              <span className="sr-only">Regular price </span>
              {formatMoney(line.cost.compareAtAmountPerQuantity)}
            </s>{" "}
          </>
        )}
        {current?.prepaid ? (
          // A prepaid plan: charged today for all its deliveries.
          <>
            {formatMoney(current.price)} each a delivery,{" "}
            {formatMoney(line.cost.amountPerQuantity)} each charged today
          </>
        ) : (
          <>
            {formatMoney(line.cost.amountPerQuantity)} each
            {current?.recurring && " a delivery"}
          </>
        )}
      </p>
      {line.discounts.length > 0 && (
        <ul aria-label={`Discounts on ${product}`}>
          {line.discounts.map((discount) => (
            <li key={discount.label}>
              {discount.label}: −{formatMoney(discount.amount)}
            </li>
          ))}
        </ul>
      )}
      <div role="group" aria-labelledby={`${id}-label`}>
        <span id={`${id}-label`}>Quantity for {product}</span>{" "}
        <button
          type="button"
          aria-label={`Decrease quantity of ${product}`}
          disabled={disabled || line.quantity - bounds.step < bounds.min}
          onClick={() => onQuantity(line.quantity - bounds.step)}
        >
          −
        </button>
        <input
          type="number"
          inputMode="numeric"
          min={0}
          max={bounds.max}
          step={bounds.step}
          aria-labelledby={`${id}-label`}
          value={draft ?? line.quantity}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === "Enter") commit();
          }}
          disabled={disabled}
        />
        <button
          type="button"
          aria-label={`Increase quantity of ${product}`}
          disabled={disabled || line.quantity + bounds.step > bounds.max}
          onClick={() => onQuantity(line.quantity + bounds.step)}
        >
          +
        </button>{" "}
        <button
          type="button"
          aria-label={`Remove ${product}`}
          disabled={disabled}
          onClick={onRemove}
        >
          Remove
        </button>
      </div>
      <p>
        {line.discounts.length > 0
          ? "Line total after discounts"
          : "Line total"}
        : {formatMoney(line.cost.totalAmount)}
      </p>
    </li>
  );
}
