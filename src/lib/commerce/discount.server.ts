import "server-only";
import { CART_ERRORS, cartWarningMessage } from "./cart-messages";
import { mutate, readCartId } from "./cart.server";
import { CartNotFoundError } from "./shopify/errors";
import {
  addGiftCardCode,
  createCartWithCodes,
  fetchCart,
  removeGiftCards,
  setCartDiscountCodes,
  type DiscountWarning,
} from "./shopify/operations/cart";
import type { BuyerContext, CartRecord, CartResult } from "./types";

// Codes that will never apply are taken off the cart again. Others (minimum
// not reached, no eligible items yet) stay and apply once the cart
// qualifies, as Shopify does. Because of that, a "not found" or "inactive"
// warning can only be about the code just added.
const DROP = new Set(["DISCOUNT_NOT_FOUND", "DISCOUNT_CURRENTLY_INACTIVE"]);

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

// Which warning is about this code: Shopify's message names the code,
// except for "not found".
export function warningFor(
  code: string,
  warnings: DiscountWarning[],
): DiscountWarning | null {
  // The code as a whole word, so a warning about VIP20 isn't read as one
  // about VIP.
  const escaped = code.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const word = new RegExp(
    `(^|[^\\p{L}\\p{N}])${escaped}($|[^\\p{L}\\p{N}])`,
    "iu",
  );
  const named = warnings.find((w) => word.test(w.message));
  return (
    named ??
    warnings.find((w) => DROP.has(w.code)) ??
    (warnings.length === 1 ? warnings[0] : null)
  );
}

// Adds a code to the visitor's cart, creating the cart if needed (a code
// from a link can arrive before any item). Shopify matches codes regardless
// of case. One field takes discount codes and gift card codes: a code
// Shopify doesn't know as a discount is tried as a gift card.
export async function applyDiscountCode(
  code: string,
  buyer: BuyerContext,
): Promise<CartResult> {
  let outcome: {
    applied: boolean;
    giftCard: boolean;
    reason: string | null;
  } = { applied: false, giftCard: false, reason: null };
  const result = await mutate(buyer, async (buyerIp) => {
    const cartId = await readCartId();
    const existing = cartId ? await fetchCart(cartId, buyerIp) : null;
    const codes = existing?.discountCodes.map((c) => c.code) ?? [];
    const applied = existing
      ? await setCartDiscountCodes(
          existing.id,
          codes.some((c) => same(c, code)) ? codes : [...codes, code],
          buyerIp,
        )
      : await createCartWithCodes([code], buyerIp);
    const { warnings } = applied;
    let { cart } = applied;
    const status = cart.discountCodes.find((c) => same(c.code, code));
    const warning = warningFor(code, warnings);
    outcome = {
      applied: status?.applicable ?? false,
      giftCard: false,
      reason: warning ? cartWarningMessage(warning.code) : null,
    };
    if (!outcome.applied && warning && DROP.has(warning.code)) {
      ({ cart } = await setCartDiscountCodes(
        cart.id,
        cart.discountCodes.map((c) => c.code).filter((c) => !same(c, code)),
        buyerIp,
      ));
      // Not a discount: perhaps a gift card.
      const gift = await addGiftCardCode(
        cart.id,
        code,
        buyerIp,
        cart.giftCards,
      );
      if (gift.applied && gift.cart) {
        cart = gift.cart;
        outcome = { applied: true, giftCard: true, reason: null };
      } else {
        // Shopify won't take a gift card on an order with a gift card in
        // it, and says nothing; say why.
        outcome.reason = gift.alreadyApplied
          ? CART_ERRORS.giftCardAlreadyApplied
          : cart.lines.some((line) => line.isGiftCard)
            ? CART_ERRORS.giftCardForGiftCard
            : CART_ERRORS.codeInvalid;
      }
    }
    return withoutDiscountWarnings(cart);
  });

  if (result.ok && outcome.giftCard) return { ...result, applied: "giftCard" };
  if (!result.ok || outcome.applied) return result;
  // Saved but not (yet) taking effect: say why.
  return {
    ok: false,
    error: outcome.reason ?? CART_ERRORS.codeNotApplied,
    cart: result.cart,
  };
}

export async function removeDiscountCode(
  code: string,
  buyer: BuyerContext,
): Promise<CartResult> {
  return mutate(buyer, async (buyerIp) => {
    const cartId = await readCartId();
    const cart = cartId ? await fetchCart(cartId, buyerIp) : null;
    if (!cart) throw new CartNotFoundError("CartDiscountCodesUpdate");
    const { cart: updated } = await setCartDiscountCodes(
      cart.id,
      cart.discountCodes.map((c) => c.code).filter((c) => !same(c, code)),
      buyerIp,
    );
    return withoutDiscountWarnings(updated);
  });
}

// Takes an applied gift card off the cart.
export async function removeGiftCard(
  giftCardId: string,
  buyer: BuyerContext,
): Promise<CartResult> {
  return mutate(buyer, async (buyerIp) => {
    const cartId = await readCartId();
    if (!cartId) throw new CartNotFoundError("CartGiftCardCodesRemove");
    return removeGiftCards(cartId, [giftCardId], buyerIp);
  });
}

// Discount warnings are reported once as the result's error, not repeated
// as cart notices.
function withoutDiscountWarnings(cart: CartRecord): CartRecord {
  return {
    ...cart,
    warnings: cart.warnings.filter((w) => !w.code.startsWith("DISCOUNT_")),
  };
}
