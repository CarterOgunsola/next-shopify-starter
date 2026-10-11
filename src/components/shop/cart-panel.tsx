"use client";

import type { Cart } from "@/lib/commerce";
import { cartViewed, useOnce } from "@/lib/commerce/analytics.client";
import { useCart } from "@/lib/commerce/cart.client";
import { freeShippingThreshold } from "@/lib/free-shipping";
import { CartContents } from "./cart-contents";

// Connects the cart store to CartContents. initialCart (server-rendered on
// /cart) shows until the store has read the cart.
export function CartPanel({ initialCart }: { initialCart?: Cart | null }) {
  const store = useCart();
  // The /cart page (the drawer reports its own views).
  useOnce(initialCart !== undefined && store.loaded ? "cart-page" : null, () =>
    cartViewed(store.cart),
  );
  return (
    <CartContents
      cart={store.loaded ? store.cart : (initialCart ?? null)}
      pending={store.pending}
      error={store.error}
      freeShippingThreshold={freeShippingThreshold()}
      onQuantity={store.setQuantity}
      onPlan={store.setPlan}
      onRemove={store.remove}
      onApplyCode={store.applyCode}
      onRemoveCode={store.removeCode}
      onRemoveGiftCard={store.removeGiftCard}
    />
  );
}
