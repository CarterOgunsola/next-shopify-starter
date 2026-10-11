import "server-only";
import { unstable_rethrow } from "next/navigation";
import { z } from "zod";
import { isShopEnabled } from "@/lib/flags";
import { getBuyerIp } from "./buyer.server";
import { readCartId } from "./cart.server";
import { customerAccess } from "./customer-token.server";
import { isTemporaryFailure } from "./errors";
import { createCart, fetchCart } from "./shopify/operations/cart";
import { shopPayCheckoutUrl } from "./shopify/shop-pay";

const input = z.object({
  variantId: z.string().regex(/^gid:\/\/shopify\/ProductVariant\/\d+$/),
  quantity: z.coerce.number().int().min(1).max(100),
});

// POST /cart/buy-now: Shop Pay express for one product from its page. A
// cart of its own (the visitor's cart is left as it is) with the visitor's
// discount codes and, when signed in, the customer, then straight to Shop
// Pay. A plain form post, so it works before the page's JavaScript runs.
export async function handleBuyNowRequest(
  request: Request,
  { shopEnabled = isShopEnabled }: { shopEnabled?: () => boolean } = {},
): Promise<Response> {
  const headers = { "Cache-Control": "private, no-store" };
  if (!shopEnabled() || request.method !== "POST") {
    return new Response(null, { status: 404, headers });
  }
  const redirect = (location: string) =>
    new Response(null, {
      status: 303,
      headers: { ...headers, Location: new URL(location, request.url).href },
    });
  const parsed = input.safeParse(
    Object.fromEntries(await request.formData().catch(() => new FormData())),
  );
  if (!parsed.success) return redirect("/cart?checkout=failed");
  try {
    const buyerIp = await getBuyerIp();
    const { token } = await customerAccess();
    const cartId = await readCartId();
    const current = cartId ? await fetchCart(cartId, buyerIp) : null;
    const cart = await createCart(
      [
        {
          merchandiseId: parsed.data.variantId,
          quantity: parsed.data.quantity,
        },
      ],
      buyerIp,
      token,
      current?.discountCodes.map((code) => code.code) ?? [],
    );
    if (!cart.checkoutUrl.startsWith("https://")) {
      return redirect("/cart?checkout=failed");
    }
    // Shopify adds what's in stock without an error: less than asked for
    // isn't what the buyer chose to pay for.
    if (cart.totalQuantity < parsed.data.quantity) {
      return redirect("/cart?checkout=stock");
    }
    const url = new URL(cart.checkoutUrl);
    if (token) url.searchParams.set("logged_in", "true");
    return redirect(shopPayCheckoutUrl(url.href));
  } catch (error) {
    unstable_rethrow(error);
    if (isTemporaryFailure(error)) {
      return redirect("/cart?checkout=busy");
    }
    console.warn(
      `[buy-now] couldn't start: ${error instanceof Error ? error.name : typeof error}`,
    );
    return redirect("/cart?checkout=failed");
  }
}
