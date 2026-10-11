import type { CartData } from "../shopify/operations/cart";
import type { ProductContentData } from "../shopify/operations/products";
import { toCart } from "../shopify/transforms/cart";
import { toProductContent } from "../shopify/transforms/product";
import type { CartRecord, ProductContent } from "../types";
import mixedCart from "./fixtures/CartCreate.one-time-and-subscription.json";
import skiWax from "./fixtures/ProductContent.selling-plans-ski-wax.json";
import complete from "./fixtures/ProductContent.the-complete-snowboard.json";
import minimal from "./fixtures/ProductContent.the-minimal-snowboard.json";
import videographer from "./fixtures/ProductContent.the-videographer-snowboard.json";
import tee from "./fixtures/ProductContent.test-tee-3-option.json";
import electrolytes from "./fixtures/ProductContent.test-electrolytes.json";
import creatine from "./fixtures/ProductContent.test-subscription-only.json";

// Domain objects from recorded fixtures, for UI tests outside lib/commerce.

const productFixtures = {
  complete,
  skiWax,
  videographer,
  minimal,
  tee,
  electrolytes,
  creatine,
};

export type ProductFixture = keyof typeof productFixtures;

export const productFixtureNames = Object.keys(
  productFixtures,
) as ProductFixture[];

export function productContent(name: ProductFixture): ProductContent {
  return toProductContent(
    productFixtures[name].data.product as ProductContentData,
  );
}

// The recorded ski wax cart: one line one time, one on its weekly plan.
export function skiWaxCart(): CartRecord {
  return toCart(mixedCart.data.cartCreate.cart as CartData, []);
}
