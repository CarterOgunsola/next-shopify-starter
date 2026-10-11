import "server-only";
import { createShopifyRequestContext as create } from "@shopify/hydrogen";

// A request context for server code without a Request object. url is the
// page's own URL; the Customer Account API needs the storefront origin.
export function createShopifyRequestContext(
  i18n: { country: "US"; language: "EN" },
  url?: string,
) {
  return create({ request: { headers: new Headers(), url }, i18n });
}
