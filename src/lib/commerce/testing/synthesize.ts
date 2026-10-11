import { createHash } from "node:crypto";
import { TEST_STORE_DOMAIN } from "./msw";

// What a synthesized value looks like, whole: a stand-in
// (syntheticKey + 12 hex digits), or "synthetic" in a fixture written by
// hand. Nothing may follow either.
export const SYNTHETIC_VALUE = /^synthetic((Cart|Key|S|Y)[0-9a-f]{12})?$/;

// The same real value always gets the same stand-in, so fixtures that
// refer to one cart still agree. Values are replaced whole: up to the next
// URL delimiter or the end of the JSON string.
const standIn = (kind: string, value: string) =>
  SYNTHETIC_VALUE.test(value)
    ? value
    : `synthetic${kind}${createHash("sha256").update(value).digest("hex").slice(0, 12)}`;

// A token or query value: anything up to ?, &, #, /, a quote or whitespace.
const VALUE = String.raw`[^?&#/"\s\\]+`;

// URL params that carry the cart's token or access key, or Shopify's
// visitor ids (_s session, _y visitor).
const PARAMS: Record<string, string> = {
  key: "Key",
  cart: "Cart",
  _s: "S",
  _y: "Y",
};

// The shop's id, which also shows in its CDN file paths
// (/s/files/1/0555/1234/5678/ for shop 55512345678).
export const SYNTHETIC_SHOP_ID = "1";
export const SYNTHETIC_FILES_PATH = "/s/files/1/0000/0000/0001/";

export function synthesize(json: string, storeDomain: string): string {
  const storeHandle = storeDomain.replace(/\.myshopify\.com$/, "");
  return json
    .replace(
      /gid:\/\/shopify\/Shop\/\d+/g,
      `gid://shopify/Shop/${SYNTHETIC_SHOP_ID}`,
    )
    .replace(/\/s\/files\/1\/\d{4}\/\d{4}\/\d{4}\//g, SYNTHETIC_FILES_PATH)
    .replaceAll(storeDomain, TEST_STORE_DOMAIN)
    .replaceAll(storeHandle, TEST_STORE_DOMAIN.replace(/\.myshopify\.com$/, ""))
    .replace(
      new RegExp(String.raw`(Cart/|/cart/c/)(${VALUE})`, "g"),
      (_, prefix: string, token: string) => prefix + standIn("Cart", token),
    )
    .replace(
      new RegExp(String.raw`([?&](key|cart|_s|_y)=)(${VALUE})`, "g"),
      (_, prefix: string, name: string, value: string) =>
        prefix + standIn(PARAMS[name], value),
    );
}
