"use client";

import { cartCountLabel } from "@/lib/commerce/cart-view";
import { useCart } from "@/lib/commerce/cart.client";

export function CartButton() {
  const { cart, loaded, openDrawer } = useCart();
  const count = cart?.totalQuantity ?? 0;
  return (
    <button
      type="button"
      data-cart-button
      aria-haspopup="dialog"
      aria-label={loaded ? `Cart, ${cartCountLabel(count)}` : "Cart"}
      onClick={openDrawer}
    >
      Cart{loaded && count > 0 ? ` (${count})` : ""}
    </button>
  );
}
