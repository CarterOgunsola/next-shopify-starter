import { getShopPayButtonUrl } from "@shopify/hydrogen";

// A cart's checkout URL as Shop Pay express checkout: the same checkout
// (discount codes, signed-in customer, consent) with Hydrogen's Shop Pay
// parameters, which take the buyer straight to Shop Pay. No channel
// parameter: Hydrogen's guidance is to leave it out unless checkout needs
// explicit attribution.
export function shopPayCheckoutUrl(checkoutUrl: string): string {
  return getShopPayButtonUrl({ checkoutUrl }) ?? checkoutUrl;
}
