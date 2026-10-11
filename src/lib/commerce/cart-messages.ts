// Our wording for Shopify's cart warnings and errors. Shopify's own messages
// aren't shown: they can change and aren't written for this site.

const WARNINGS: Record<string, string> = {
  MERCHANDISE_OUT_OF_STOCK: "An item in your cart is sold out.",
  MERCHANDISE_NOT_ENOUGH_STOCK:
    "We don't have enough stock, so the quantity was reduced.",
  PAYMENTS_GIFT_CARDS_UNAVAILABLE: "Gift cards can't be used right now.",
  DISCOUNT_NOT_FOUND: "That discount code isn't valid.",
  DISCOUNT_CODE_NOT_HONOURED:
    "That discount code can't be used with your cart as it is.",
  DISCOUNT_CURRENTLY_INACTIVE: "That discount code isn't active.",
  DISCOUNT_USAGE_LIMIT_REACHED: "That discount code has been used up.",
  DISCOUNT_PURCHASE_NOT_IN_RANGE:
    "Your cart doesn't meet that discount code's minimum yet.",
  DISCOUNT_NO_ENTITLED_LINE_ITEMS:
    "That discount code doesn't apply to the items in your cart.",
};

export function cartWarningMessage(code: string): string {
  return WARNINGS[code] ?? "Your cart changed. Check it before you check out.";
}

export const CART_ERRORS = {
  expired: "Your cart expired. Add the items again.",
  unavailable: "That item isn't available.",
  busy: "The cart is busy right now. Try again in a moment.",
  checkoutBusy: "Checkout is busy right now. Try again in a moment.",
  checkoutFailed:
    "Checkout couldn't start. Try again, or contact us if it keeps happening.",
  failed: "Your cart couldn't be updated. Try again.",
  closed: "The shop isn't open yet.",
  codeNotApplied: "That discount code isn't applied to your cart.",
  codeInvalid: "That code isn't a valid discount code or gift card.",
  giftCardAlreadyApplied: "That gift card is already on your cart.",
  giftCardForGiftCard:
    "Gift cards can't be used to buy gift cards. Remove the gift card from your cart to use this one.",
  invalid: "That request wasn't valid.",
  // An add Shopify accepted without adding anything.
  soldOut: "That item is sold out.",
  checkoutStock:
    "There isn't enough stock for Buy with Shop Pay. Choose a smaller quantity, or try again later.",
} as const;
