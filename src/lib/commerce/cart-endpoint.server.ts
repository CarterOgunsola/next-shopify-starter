import "server-only";
import { isShopEnabled } from "@/lib/flags";
import { getBuyerContext } from "./buyer.server";
import { CLEAR_CART_COOKIE, getCart, readCartId } from "./cart.server";

// GET /api/commerce/cart: the visitor's cart for the header and drawer.
// Static pages can't read the cart cookie themselves. Never cached.
export async function handleCartRequest({
  shopEnabled = isShopEnabled,
}: { shopEnabled?: () => boolean } = {}): Promise<Response> {
  const headers = { "Cache-Control": "private, no-store" };
  if (!shopEnabled()) {
    return Response.json({ error: "not_found" }, { status: 404, headers });
  }
  const cart = await getCart(await getBuyerContext());
  // The cookie names a cart Shopify no longer has (expired or completed):
  // drop it, so later reads don't ask again. Pages can't set cookies, but
  // every page loads the cart from here.
  if (!cart && (await readCartId())) {
    return Response.json(
      { cart },
      {
        headers: {
          ...headers,
          "Set-Cookie": CLEAR_CART_COOKIE,
        },
      },
    );
  }
  return Response.json({ cart }, { headers });
}
