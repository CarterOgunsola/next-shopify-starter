import "server-only";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { cache } from "react";
import { COOKIE_NAMES } from "@/lib/cookie-names";
import { getBuyerIp } from "./buyer.server";
import { CART_ERRORS } from "./cart-messages";
import { customerAccess } from "./customer-token.server";
import { isTemporaryFailure } from "./errors";
import { parseGid } from "./shopify/ids";
import {
  addCartLines,
  createCart,
  fetchCart,
  removeCartLines,
  updateCartLines,
} from "./shopify/operations/cart";
import { CartNotFoundError, ShopifyUserError } from "./shopify/errors";
import { toClientCart } from "./shopify/transforms/cart";
import type {
  BuyerContext,
  Cart,
  CartLine,
  CartLineInput,
  CartLineUpdate,
  CartRecord,
  CartResult,
} from "./types";

// The cart: read per request, never cached. The cart id (with its access
// key) and checkout URL stay on the server: the id lives in an HttpOnly
// cookie, and the browser only ever gets the client Cart.

export const CART_COOKIE = COOKIE_NAMES.cart;

export const CART_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: true,
  sameSite: "lax",
  path: "/",
  maxAge: 14 * 24 * 60 * 60,
} as const;

// A Set-Cookie value that removes the cart cookie, for responses built by
// hand (route handlers and the proxy).
export const CLEAR_CART_COOKIE = `${CART_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;

export async function readCartId(): Promise<string | null> {
  const value = (await cookies()).get(CART_COOKIE)?.value;
  return value && parseGid(value)?.type === "Cart" ? value : null;
}

// Written only when the cart id changes: setting a cookie in a server
// action makes Next re-render the current page in the response, which
// every quantity change shouldn't cost.
async function saveCartId(cartId: string): Promise<void> {
  (await cookies()).set(CART_COOKIE, cartId, CART_COOKIE_OPTIONS);
}

async function clearCartId(): Promise<void> {
  (await cookies()).delete(CART_COOKIE);
}

// The visitor's cart with its id and checkout URL, or null if they have
// none (or it expired). Server only. Safe to call several times a request.
export const getCartRecord = cache(
  async (_buyer: BuyerContext): Promise<CartRecord | null> => {
    // Request time only: a prerender (including Next's runtime prerender of
    // /cart) would start the Shopify call and abort it.
    await connection();
    const cartId = await readCartId();
    if (!cartId) return null;
    return fetchCart(cartId, await getBuyerIp());
  },
);

// The visitor's cart as the browser may see it.
export async function getCart(buyer: BuyerContext): Promise<Cart | null> {
  const record = await getCartRecord(buyer);
  return record && toClientCart(record);
}

// Adds lines, creating the cart on the first add. An expired or completed
// cart is replaced with a new one.
// Shopify accepts adding a sold-out item without an error: it answers
// with a warning and the line at quantity 0. That add failed.
export function unfilledAdd(
  lines: CartLineInput[],
  cart: { lines: CartLine[]; warnings: { code: string }[] },
): string | null {
  if (!cart.warnings.some((w) => w.code === "MERCHANDISE_OUT_OF_STOCK")) {
    return null;
  }
  for (const input of lines) {
    const line = cart.lines.find(
      (l) => l.merchandise.id === input.merchandiseId,
    );
    if (!line || line.quantity === 0) return CART_ERRORS.soldOut;
  }
  return null;
}

export async function addToCart(
  lines: CartLineInput[],
  buyer: BuyerContext,
): Promise<CartResult> {
  const result = await addLines(lines, buyer);
  const unfilled = result.ok ? unfilledAdd(lines, result.cart) : null;
  return unfilled ? { ok: false, error: unfilled, cart: result.cart } : result;
}

async function addLines(
  lines: CartLineInput[],
  buyer: BuyerContext,
): Promise<CartResult> {
  return mutate(buyer, async (buyerIp) => {
    const cartId = await readCartId();
    if (cartId) {
      try {
        return await addCartLines(cartId, lines, buyerIp);
      } catch (error) {
        if (!(error instanceof CartNotFoundError)) throw error;
      }
    }
    return createCart(lines, buyerIp, (await customerAccess()).token);
  });
}

// Quantity 0 removes a line.
export async function updateCart(
  lines: CartLineUpdate[],
  buyer: BuyerContext,
): Promise<CartResult> {
  return mutate(buyer, async (buyerIp) => {
    const cartId = await readCartId();
    if (!cartId) throw new CartNotFoundError("CartLinesUpdate");
    return updateCartLines(cartId, lines, buyerIp);
  });
}

export async function removeFromCart(
  lineIds: string[],
  buyer: BuyerContext,
): Promise<CartResult> {
  return mutate(buyer, async (buyerIp) => {
    const cartId = await readCartId();
    if (!cartId) throw new CartNotFoundError("CartLinesRemove");
    return removeCartLines(cartId, lineIds, buyerIp);
  });
}

// Runs a cart change: saves a new cart id, clears an expired one, and turns
// Shopify errors into a CartResult.
export async function mutate(
  buyer: BuyerContext,
  change: (buyerIp: string | undefined) => Promise<CartRecord>,
): Promise<CartResult> {
  try {
    const before = await readCartId();
    const record = await change(await getBuyerIp());
    if (record.id !== before) await saveCartId(record.id);
    return { ok: true, cart: toClientCart(record) };
  } catch (error) {
    if (error instanceof CartNotFoundError) {
      await clearCartId();
      return { ok: false, error: CART_ERRORS.expired, cart: null };
    }
    const cart = await getCart(buyer).catch(() => null);
    if (error instanceof ShopifyUserError) {
      const unavailable = error.userErrors.some((e) =>
        e.field?.includes("merchandiseId"),
      );
      return {
        ok: false,
        error: unavailable ? CART_ERRORS.unavailable : CART_ERRORS.failed,
        cart,
      };
    }
    if (isTemporaryFailure(error)) {
      return { ok: false, error: CART_ERRORS.busy, cart };
    }
    throw error;
  }
}
