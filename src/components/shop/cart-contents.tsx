"use client";

import Link from "next/link";
import { Fragment } from "react";
import { formatMoney, type Cart } from "@/lib/commerce";
import { CartLineItem } from "./cart-line-item";
import { DiscountCodes } from "./discount-codes";
import { FreeShippingProgress } from "./free-shipping-progress";

// The cart, used in the drawer and on /cart. Renders props only.
export function CartContents({
  cart,
  pending,
  error,
  freeShippingThreshold,
  onQuantity,
  onPlan,
  onRemove,
  onApplyCode,
  onRemoveCode,
  onRemoveGiftCard,
}: {
  cart: Cart | null;
  pending: boolean;
  error: string | null;
  // Unset: no free-shipping progress.
  freeShippingThreshold?: string;
  onQuantity: (lineId: string, quantity: number) => void;
  onPlan: (lineId: string, planId: string | null) => void;
  onRemove: (lineId: string) => void;
  onApplyCode: (code: string) => void;
  onRemoveCode: (code: string) => void;
  onRemoveGiftCard?: (id: string) => void;
}) {
  const lines = cart?.lines ?? [];

  return (
    <div aria-busy={pending}>
      {error && <p role="alert">{error}</p>}
      {cart && cart.warnings.length > 0 && (
        <ul aria-label="Cart notices">
          {cart.warnings.map((warning) => (
            <li key={warning.code}>{warning.message}</li>
          ))}
        </ul>
      )}
      {lines.length === 0 ? (
        <p>
          Your cart is empty. <Link href="/shop">Browse the shop</Link>.
        </p>
      ) : (
        <>
          <ul aria-label="Items in your cart">
            {lines.map((line) => (
              <CartLineItem
                key={line.id}
                line={line}
                disabled={false}
                onQuantity={(quantity) => onQuantity(line.id, quantity)}
                onPlan={(planId) => onPlan(line.id, planId)}
                onRemove={() => onRemove(line.id)}
              />
            ))}
          </ul>
          {freeShippingThreshold && (
            <FreeShippingProgress
              subtotal={cart!.cost.subtotalAmount}
              threshold={freeShippingThreshold}
            />
          )}
          <DiscountCodes
            codes={cart!.discountCodes}
            giftCards={cart!.giftCards}
            pending={pending}
            onApply={onApplyCode}
            onRemove={onRemoveCode}
            onRemoveGiftCard={onRemoveGiftCard}
          />
          <dl>
            <dt>Subtotal</dt>
            <dd>{formatMoney(cart!.cost.subtotalAmount)}</dd>
            {cart!.discounts.map((discount) => (
              <Fragment key={discount.label}>
                <dt>Discount ({discount.label})</dt>
                <dd>−{formatMoney(discount.amount)}</dd>
              </Fragment>
            ))}
            {/* Shopify's total is after gift cards: each one is shown. */}
            {cart!.giftCards.map((card) => (
              <Fragment key={card.id}>
                <dt>Gift card ending {card.lastCharacters.toUpperCase()}</dt>
                <dd>−{formatMoney(card.amountUsed)}</dd>
              </Fragment>
            ))}
            <dt>Total</dt>
            <dd>{formatMoney(cart!.cost.totalAmount)}</dd>
            {Number(cart!.cost.checkoutChargeAmount.amount) <
              Number(cart!.cost.subtotalAmount.amount) && (
              <>
                {/* A selling plan that bills later. Shopify's charge is
                    before discounts, so it's compared with the subtotal. */}
                <dt>Due today, before discounts</dt>
                <dd>{formatMoney(cart!.cost.checkoutChargeAmount)}</dd>
              </>
            )}
          </dl>
          <p>Shipping and taxes are calculated at checkout.</p>
          <CheckoutLink
            pending={pending}
            shopPay={
              !cart!.lines.some((line) => line.sellingPlan || line.isGiftCard)
            }
          />
        </>
      )}
    </div>
  );
}

// A plain link (works before hydration): /cart/checkout redirects to
// Shopify's checkout URL, read on the server. Held while a change is saving
// so checkout never starts from a cart that's about to change.
function CheckoutLink({
  pending,
  shopPay,
}: {
  pending: boolean;
  // Offer Shop Pay express too (not for plans or gift cards).
  shopPay: boolean;
}) {
  const hold = (event: { preventDefault(): void }) => {
    if (pending) event.preventDefault();
  };
  return (
    <>
      <a
        href="/cart/checkout"
        aria-disabled={pending || undefined}
        aria-describedby={pending ? "checkout-pending" : undefined}
        onClick={hold}
      >
        Check out
      </a>
      {shopPay && (
        <>
          {" "}
          <a
            href="/cart/checkout?payment=shop_pay"
            rel="nofollow"
            aria-disabled={pending || undefined}
            aria-describedby={pending ? "checkout-pending" : undefined}
            onClick={hold}
          >
            Check out with Shop Pay
          </a>
        </>
      )}
      {pending && <p id="checkout-pending">Updating your cart.</p>}
    </>
  );
}
