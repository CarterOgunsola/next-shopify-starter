import type { Metadata } from "next";
import { Suspense } from "react";
import { CartPanel } from "@/components/shop/cart-panel";
import { getBuyerContext } from "@/lib/commerce/buyer.server";
import { getCart } from "@/lib/commerce/cart.server";
import { CART_ERRORS } from "@/lib/commerce/cart-messages";
import { requireShop } from "@/lib/flags";

// Private to the visitor: never indexed.
export const metadata: Metadata = {
  title: "Cart",
  robots: { index: false, follow: false },
};

export default function CartPage({ searchParams }: PageProps<"/cart">) {
  requireShop();
  return (
    <>
      <h1>Cart</h1>
      <Suspense fallback={<p>Loading your cart.</p>}>
        <ServerCart searchParams={searchParams} />
      </Suspense>
    </>
  );
}

// Rendered on the server per request (it reads the cart cookie), so the
// cart shows before the browser store has loaded it. It streams in, and the
// cart controls need JavaScript.
async function ServerCart({
  searchParams,
}: Pick<PageProps<"/cart">, "searchParams">) {
  const [cart, { checkout }] = await Promise.all([
    getBuyerContext().then(getCart),
    searchParams,
  ]);
  return (
    <>
      {/* /cart/checkout couldn't reach Shopify. */}
      {checkout === "busy" && <p role="alert">{CART_ERRORS.checkoutBusy}</p>}
      {checkout === "failed" && (
        <p role="alert">{CART_ERRORS.checkoutFailed}</p>
      )}
      {checkout === "stock" && <p role="alert">{CART_ERRORS.checkoutStock}</p>}
      <CartPanel initialCart={cart} />
    </>
  );
}
