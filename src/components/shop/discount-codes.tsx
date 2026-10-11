"use client";

import { useId, useState } from "react";
import { formatMoney, type Cart } from "@/lib/commerce";

// One field for discount codes and gift card codes (the server tries a
// code as a discount, then as a gift card), with the codes and gift cards
// on the cart. Renders props only.
export function DiscountCodes({
  codes,
  giftCards = [],
  pending,
  onApply,
  onRemove,
  onRemoveGiftCard = () => {},
}: {
  codes: Cart["discountCodes"];
  giftCards?: Cart["giftCards"];
  pending: boolean;
  onApply: (code: string) => void;
  onRemove: (code: string) => void;
  onRemoveGiftCard?: (id: string) => void;
}) {
  const id = useId();
  const [code, setCode] = useState("");
  // The field keeps what was typed until the code shows up on the cart, so
  // a mistyped code can be fixed instead of typed again. (Adjusted during
  // render when the cart changes, React's pattern for derived resets.)
  const [sent, setSent] = useState<string | null>(null);
  const onCart = (typed: string) =>
    codes.some((c) => c.code.toLowerCase() === typed.toLowerCase()) ||
    giftCards.some((card) =>
      typed
        .replace(/\s+/g, "")
        .toLowerCase()
        .endsWith(card.lastCharacters.toLowerCase()),
    );
  if (sent && onCart(sent)) {
    setCode("");
    setSent(null);
  }

  return (
    <section aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`}>Discount or gift card</h2>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (!code.trim()) return;
          onApply(code.trim());
          setSent(code.trim());
        }}
      >
        <label htmlFor={`${id}-code`}>Discount code or gift card code</label>{" "}
        <input
          id={`${id}-code`}
          name="code"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          value={code}
          onChange={(event) => setCode(event.target.value)}
        />{" "}
        <button type="submit" disabled={pending || !code.trim()}>
          Apply
        </button>
      </form>
      {codes.length > 0 && (
        <ul aria-label="Discount codes on your cart">
          {codes.map((discount) => (
            <li key={discount.code}>
              {discount.code.toUpperCase()}
              {discount.applicable
                ? " (applied)"
                : " (not applied to your cart yet)"}{" "}
              <button
                type="button"
                aria-label={`Remove discount code ${discount.code.toUpperCase()}`}
                disabled={pending}
                onClick={() => onRemove(discount.code)}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
      {giftCards.length > 0 && (
        <ul aria-label="Gift cards on your cart">
          {giftCards.map((card) => (
            <li key={card.id}>
              Gift card ending {card.lastCharacters.toUpperCase()}:{" "}
              {formatMoney(card.amountUsed)} used on this order,{" "}
              {formatMoney(card.balance)} left on the card{" "}
              <button
                type="button"
                aria-label={`Remove gift card ending ${card.lastCharacters.toUpperCase()}`}
                disabled={pending}
                onClick={() => onRemoveGiftCard(card.id)}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
