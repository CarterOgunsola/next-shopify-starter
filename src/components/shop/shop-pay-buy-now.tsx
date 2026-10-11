"use client";

import { useEffect, useState } from "react";

// Shop Pay express for this product: a plain form post to /cart/buy-now
// (works before the page's JavaScript runs), which starts a checkout of
// its own and goes to Shop Pay. Coming back with the browser's back button
// restores the page from its cache, so the button is reset then.
export function ShopPayBuyNow({
  variantId,
  quantity,
}: {
  variantId: string;
  quantity: number;
}) {
  const [submitting, setSubmitting] = useState(false);
  useEffect(() => {
    const restored = (event: PageTransitionEvent) => {
      if (event.persisted) setSubmitting(false);
    };
    window.addEventListener("pageshow", restored);
    return () => window.removeEventListener("pageshow", restored);
  }, []);
  return (
    <form
      method="post"
      action="/cart/buy-now"
      // One checkout per click: a second submit while the first is on its
      // way is ignored.
      onSubmit={(event) => {
        if (submitting) event.preventDefault();
        else setSubmitting(true);
      }}
      aria-busy={submitting || undefined}
    >
      <input type="hidden" name="variantId" value={variantId} />
      <input type="hidden" name="quantity" value={quantity} />
      <button type="submit" aria-disabled={submitting || undefined}>
        {submitting ? "Opening Shop Pay…" : "Buy with Shop Pay"}
      </button>
    </form>
  );
}
