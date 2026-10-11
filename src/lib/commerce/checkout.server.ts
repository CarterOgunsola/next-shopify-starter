import "server-only";
import { unstable_rethrow } from "next/navigation";
import { isShopEnabled } from "@/lib/flags";
import { getBuyerContext, getBuyerIp } from "./buyer.server";
import { getCartRecord, readCartId } from "./cart.server";
import { customerAccess } from "./customer-token.server";
import { isTemporaryFailure } from "./errors";
import { ShopifyRequestError } from "./shopify/errors";
import { linkCartToCustomer } from "./shopify/operations/cart";
import { shopPayCheckoutUrl } from "./shopify/shop-pay";
import type { CartRecord } from "./types";

// GET /cart/checkout: sends the visitor to Shopify's checkout for their
// cart. The checkout URL is read here, fresh, so it never reaches the
// browser before the visitor asks for it, and carries their consent.
// No cart (or an empty one): back to /cart.
//
// Signed in: the cart is attached to the customer again (their token may
// have been refreshed since) and the URL gets logged_in=true, Shopify's
// signal that checkout should use the customer's session, as Hydrogen's
// cart handlers do, but only when the cart was actually attached. An
// expired token goes through /account/refresh once; a session that can't be
// read checks out as a guest. Shopify being briefly unreachable (or a
// request without a client IP) goes back to /cart?checkout=busy.
export async function handleCheckoutRequest(
  request: Request,
  { shopEnabled = isShopEnabled }: { shopEnabled?: () => boolean } = {},
): Promise<Response> {
  const headers = { "Cache-Control": "private, no-store" };
  if (!shopEnabled()) return new Response(null, { status: 404, headers });
  const redirect = (location: string) =>
    new Response(null, {
      status: 303,
      headers: { ...headers, Location: new URL(location, request.url).href },
    });

  try {
    return await checkout(request, redirect);
  } catch (error) {
    if (isTemporaryFailure(error)) {
      return redirect("/cart?checkout=busy");
    }
    // Shopify refused the cart read: back to the cart, which says so.
    if (error instanceof ShopifyRequestError) {
      console.warn(`[checkout] Shopify refused the request: ${error.name}`);
      return redirect("/cart?checkout=failed");
    }
    throw error;
  }
}

async function checkout(
  request: Request,
  redirect: (location: string) => Response,
): Promise<Response> {
  const { signedIn, token } = await customerAccess().catch((error: unknown) => {
    // Next's own signals (a dynamic request during the build) go on.
    unstable_rethrow(error);
    console.warn(
      `[checkout] customer session unreadable: ${error instanceof Error ? error.name : typeof error}`,
    );
    return { signedIn: false, token: undefined };
  });
  const params = new URL(request.url).searchParams;
  const refreshed = params.has("refreshed");
  if (signedIn && !token && !refreshed) {
    // Back to this checkout, Shop Pay included.
    const again = `/cart/checkout?refreshed=1${params.get("payment") === "shop_pay" ? "&payment=shop_pay" : ""}`;
    const back = `/account/link-cart?return_to=${encodeURIComponent(again)}`;
    return redirect(`/account/refresh?return_to=${encodeURIComponent(back)}`);
  }

  const { cart, linked } = token
    ? await attach(token)
    : { cart: await getCartRecord(await getBuyerContext()), linked: false };
  if (
    !cart ||
    cart.totalQuantity === 0 ||
    !cart.checkoutUrl.startsWith("https://")
  ) {
    return redirect("/cart");
  }
  const url = new URL(cart.checkoutUrl);
  if (linked) url.searchParams.set("logged_in", "true");
  // ?payment=shop_pay: the cart's "Check out with Shop Pay".
  const shopPay =
    new URL(request.url).searchParams.get("payment") === "shop_pay";
  return redirect(shopPay ? shopPayCheckoutUrl(url.href) : url.href);
}

// The visitor's cart with the customer attached, or as it stands if that
// fails (checkout still works, just not signed in).
async function attach(
  token: string,
): Promise<{ cart: CartRecord | null; linked: boolean }> {
  const cartId = await readCartId();
  if (!cartId) return { cart: null, linked: false };
  const buyerIp = await getBuyerIp();
  try {
    return {
      cart: await linkCartToCustomer(cartId, token, buyerIp),
      linked: true,
    };
  } catch {
    console.warn("[checkout] attaching the customer to the cart failed.");
    return {
      cart: await getCartRecord(await getBuyerContext()),
      linked: false,
    };
  }
}
