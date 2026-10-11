"use client";

import { useId, useRef, useState } from "react";
import {
  productViewed,
  useOnce,
  type ViewedProduct,
} from "@/lib/commerce/analytics.client";
import { useCart } from "@/lib/commerce/cart.client";
import { BADGE_TEXT } from "@/lib/commerce/compliance";
import { clampQuantity, quantityBounds } from "@/lib/commerce/quantity";
import type {
  ProductOption,
  SellingPlanGroup,
  VariantView,
} from "@/lib/commerce";
import { useVariantView } from "@/lib/commerce/use-variant-view";
import {
  addDisabledReason,
  matchesSelection,
  staticOptionStates,
  variantAnnouncement,
  withSelection,
} from "@/lib/commerce/variant-selection";
import { planOffers } from "@/lib/commerce/selling-plans";
import { giftCardAttributes, recipientErrors } from "@/lib/commerce/gift-card";
import { GiftRecipientFields, type GiftState, NO_GIFT } from "./gift-recipient";
import { NotifyMe } from "./notify-me";
import { ShopPayBuyNow } from "./shop-pay-buy-now";
import { PurchaseOptions } from "./purchase-options";
import { VariantPicker } from "./variant-picker";
import { VariantPrice } from "./variant-price";

export function ProductPurchase({
  handle,
  options,
  sellingPlanGroups,
  requiresSellingPlan,
  initialView,
  product,
  backInStock = false,
  marketingOptIn = false,
  isGiftCard = false,
  inUrl = true,
  onAdded,
  express = true,
}: {
  // Offer Shop Pay express (the product page; quick add leaves it out).
  express?: boolean;
  // false in quick add: the selection stays out of the page's URL.
  inUrl?: boolean;
  // After a successful add (quick add closes its dialog).
  onAdded?: () => void;
  // Gift cards take optional recipient details.
  isGiftCard?: boolean;
  // Back-in-stock alerts are set up: sold-out variants offer Notify me.
  backInStock?: boolean;
  // Notify me also offers marketing email (a list is set up).
  marketingOptIn?: boolean;
  // For the product-viewed event.
  product?: ViewedProduct;
  handle: string;
  options: ProductOption[];
  sellingPlanGroups: SellingPlanGroup[];
  requiresSellingPlan: boolean;
  initialView: VariantView | null;
}) {
  const { status, view, selection, select, retry } = useVariantView(
    handle,
    options,
    initialView,
    { inUrl },
  );
  const cart = useCart();
  const [planId, setPlanId] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [gift, setGift] = useState<GiftState>(NO_GIFT);
  const [giftErrors, setGiftErrors] = useState<
    ReturnType<typeof recipientErrors>
  >({});
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  // The live region speaks only after the visitor picks a value, not on
  // load or when the page restores a selection from the URL.
  const [chosen, setChosen] = useState(false);
  const id = useId();
  // Focus lands here after Try again, which disappears once clicked.
  const section = useRef<HTMLElement>(null);
  const variant = view?.variant ?? null;
  const unavailable =
    status === "ready" && !!variant && !matchesSelection(variant, selection);
  const plans = variant?.sellingPlanPrices ?? [];
  // A subscription-only product starts on its first plan.
  const activePlan = plans.some((p) => p.planId === planId)
    ? planId
    : requiresSellingPlan
      ? (plans[0]?.planId ?? null)
      : null;
  const bounds = quantityBounds(variant?.quantityRule);

  useOnce(status === "ready" && variant && product ? handle : null, () => {
    if (product && variant) productViewed(product, variant);
  });
  const reason =
    addDisabledReason(status, view, selection) ??
    (requiresSellingPlan && !activePlan ? "Choose a subscription." : null);

  const add = async () => {
    if (!variant || reason || adding) return;
    if (isGiftCard && gift.send) {
      const problems = recipientErrors(gift.recipient);
      setGiftErrors(problems);
      if (Object.keys(problems).length > 0) {
        // Focus the first field to fix (after the errors render).
        requestAnimationFrame(() =>
          section.current
            ?.querySelector<HTMLElement>('[aria-invalid="true"]')
            ?.focus(),
        );
        return;
      }
    }
    setAdding(true);
    setAddError(null);
    const result = await cart.add([
      {
        merchandiseId: variant.id,
        quantity: clampQuantity(quantity, variant.quantityRule),
        ...(activePlan ? { sellingPlanId: activePlan } : {}),
        ...(isGiftCard && gift.send
          ? {
              attributes: giftCardAttributes(
                gift.recipient,
                new Date().getTimezoneOffset(),
              ),
            }
          : {}),
      },
    ]);
    setAdding(false);
    if (!result.ok) setAddError(result.error);
    else onAdded?.();
  };

  return (
    <section aria-label="Purchase" ref={section} tabIndex={-1}>
      <VariantPicker
        options={
          view
            ? withSelection(view.options, selection)
            : staticOptionStates(options, selection)
        }
        onSelect={(name, value) => {
          setChosen(true);
          select(name, value);
        }}
      />
      <VariantPrice
        variant={variant}
        unavailable={unavailable}
        plan={
          requiresSellingPlan && variant
            ? (planOffers(sellingPlanGroups, variant).find(
                (offer) => offer.id === activePlan,
              ) ?? null)
            : null
        }
      />
      {/* Live, so it can say how many are left. */}
      {status === "ready" && variant?.lowStock && !unavailable && (
        <p>{BADGE_TEXT.lowStock(variant.lowStock)}</p>
      )}
      {variant && !unavailable && (
        <PurchaseOptions
          groups={sellingPlanGroups}
          variant={variant}
          planId={activePlan}
          requiresPlan={requiresSellingPlan}
          onChange={setPlanId}
        />
      )}
      {isGiftCard && (
        <GiftRecipientFields
          value={gift}
          errors={giftErrors}
          onChange={(next) => {
            setGift(next);
            setGiftErrors({});
          }}
        />
      )}
      <label htmlFor={`${id}-quantity`}>Quantity</label>{" "}
      <input
        id={`${id}-quantity`}
        type="number"
        inputMode="numeric"
        min={bounds.min}
        max={bounds.max}
        step={bounds.step}
        value={quantity}
        onChange={(event) => setQuantity(Number(event.target.value))}
        onBlur={() =>
          setQuantity(clampQuantity(quantity, variant?.quantityRule))
        }
      />{" "}
      <button
        type="button"
        disabled={!!reason}
        // Stays focusable while adding, so focus can come back here when the
        // cart drawer closes.
        aria-disabled={adding || undefined}
        aria-describedby={reason ? `${id}-reason` : undefined}
        onClick={add}
      >
        {adding ? "Adding…" : "Add to cart"}
      </button>
      {reason && <p id={`${id}-reason`}>{reason}</p>}
      {/* Shop Pay express: a resolved, available one-time purchase only
          (not a plan or a gift card). */}
      {express &&
        variant &&
        !reason &&
        status === "ready" &&
        !unavailable &&
        !activePlan &&
        !requiresSellingPlan &&
        !isGiftCard && (
          <ShopPayBuyNow
            variantId={variant.id}
            quantity={clampQuantity(quantity, variant.quantityRule)}
          />
        )}
      {backInStock && variant?.available === false && !unavailable && (
        <NotifyMe
          key={variant.id}
          variantId={variant.id}
          variantLabel={options.length > 0 ? variant.title : null}
          marketingOptIn={marketingOptIn}
        />
      )}
      {addError && <p role="alert">{addError}</p>}
      {status === "error" && (
        <button
          type="button"
          onClick={() => {
            retry();
            section.current?.focus();
          }}
        >
          Try again
        </button>
      )}
      <p aria-live="polite" className="sr-only">
        {chosen && status === "ready" && variant
          ? unavailable
            ? "This combination isn't available."
            : variantAnnouncement(variant, options.length > 0)
          : ""}
      </p>
    </section>
  );
}
