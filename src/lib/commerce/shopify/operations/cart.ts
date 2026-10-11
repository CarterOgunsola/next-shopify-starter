import "server-only";
import { gql, type StorefrontApi } from "@shopify/hydrogen";
import type { CartLineInput, CartLineUpdate, CartRecord } from "../../types";
import { storefrontRequest } from "../client.server";
import {
  assertNoUserErrors,
  CartNotFoundError,
  type UserError,
} from "../errors";
import { CartFragment, CartPayloadFragment } from "../fragments/cart";
import { toCart } from "../transforms/cart";

// Cart reads and writes, always with the visitor's IP (Shopify bot
// protection applies to carts). The cart id is a bearer secret: it never
// goes to the browser or into logs.

export const CartQuery = gql(
  `
    query Cart(
      $cartId: ID!
      $country: CountryCode
      $language: LanguageCode
      $visitorConsent: VisitorConsent
    )
    @inContext(
      country: $country
      language: $language
      visitorConsent: $visitorConsent
    ) {
      cart(id: $cartId) {
        ...Cart
      }
    }
  `,
  [CartFragment],
);

export const CartCreate = gql(
  `
    mutation CartCreate(
      $input: CartInput!
      $country: CountryCode
      $language: LanguageCode
      $visitorConsent: VisitorConsent
    ) @inContext(
      country: $country
      language: $language
      visitorConsent: $visitorConsent
    ) {
      cartCreate(input: $input) {
        cart {
          ...Cart
        }
        userErrors {
          ...CartPayloadErrors
        }
        warnings {
          code
          message
        }
      }
    }
  `,
  [CartFragment, CartPayloadFragment],
);

export const CartLinesAdd = gql(
  `
    mutation CartLinesAdd(
      $cartId: ID!
      $lines: [CartLineInput!]!
      $country: CountryCode
      $language: LanguageCode
      $visitorConsent: VisitorConsent
    ) @inContext(
      country: $country
      language: $language
      visitorConsent: $visitorConsent
    ) {
      cartLinesAdd(cartId: $cartId, lines: $lines) {
        cart {
          ...Cart
        }
        userErrors {
          ...CartPayloadErrors
        }
        warnings {
          code
        }
      }
    }
  `,
  [CartFragment, CartPayloadFragment],
);

export const CartLinesUpdate = gql(
  `
    mutation CartLinesUpdate(
      $cartId: ID!
      $lines: [CartLineUpdateInput!]!
      $country: CountryCode
      $language: LanguageCode
      $visitorConsent: VisitorConsent
    ) @inContext(
      country: $country
      language: $language
      visitorConsent: $visitorConsent
    ) {
      cartLinesUpdate(cartId: $cartId, lines: $lines) {
        cart {
          ...Cart
        }
        userErrors {
          ...CartPayloadErrors
        }
        warnings {
          code
        }
      }
    }
  `,
  [CartFragment, CartPayloadFragment],
);

export const CartLinesRemove = gql(
  `
    mutation CartLinesRemove(
      $cartId: ID!
      $lineIds: [ID!]!
      $country: CountryCode
      $language: LanguageCode
      $visitorConsent: VisitorConsent
    ) @inContext(
      country: $country
      language: $language
      visitorConsent: $visitorConsent
    ) {
      cartLinesRemove(cartId: $cartId, lineIds: $lineIds) {
        cart {
          ...Cart
        }
        userErrors {
          ...CartPayloadErrors
        }
        warnings {
          code
        }
      }
    }
  `,
  [CartFragment, CartPayloadFragment],
);

export const CartDiscountCodesUpdate = gql(
  `
    mutation CartDiscountCodesUpdate(
      $cartId: ID!
      $discountCodes: [String!]!
      $country: CountryCode
      $language: LanguageCode
      $visitorConsent: VisitorConsent
    ) @inContext(
      country: $country
      language: $language
      visitorConsent: $visitorConsent
    ) {
      cartDiscountCodesUpdate(cartId: $cartId, discountCodes: $discountCodes) {
        cart {
          ...Cart
        }
        userErrors {
          ...CartPayloadErrors
        }
        warnings {
          code
          message
        }
      }
    }
  `,
  [CartFragment, CartPayloadFragment],
);

export const CartGiftCardCodesAdd = gql(
  `
    mutation CartGiftCardCodesAdd(
      $cartId: ID!
      $giftCardCodes: [String!]!
      $country: CountryCode
      $language: LanguageCode
      $visitorConsent: VisitorConsent
    ) @inContext(
      country: $country
      language: $language
      visitorConsent: $visitorConsent
    ) {
      cartGiftCardCodesAdd(cartId: $cartId, giftCardCodes: $giftCardCodes) {
        cart {
          ...Cart
        }
        userErrors {
          ...CartPayloadErrors
        }
        warnings {
          code
          message
        }
      }
    }
  `,
  [CartFragment, CartPayloadFragment],
);

export const CartGiftCardCodesRemove = gql(
  `
    mutation CartGiftCardCodesRemove(
      $cartId: ID!
      $appliedGiftCardIds: [ID!]!
      $country: CountryCode
      $language: LanguageCode
      $visitorConsent: VisitorConsent
    ) @inContext(
      country: $country
      language: $language
      visitorConsent: $visitorConsent
    ) {
      cartGiftCardCodesRemove(
        cartId: $cartId
        appliedGiftCardIds: $appliedGiftCardIds
      ) {
        cart {
          ...Cart
        }
        userErrors {
          ...CartPayloadErrors
        }
        warnings {
          code
          message
        }
      }
    }
  `,
  [CartFragment, CartPayloadFragment],
);

export type CartData = NonNullable<
  StorefrontApi.ResultOf<typeof CartQuery>["cart"]
>;

type Payload = {
  cart?: CartData | null;
  userErrors: readonly UserError[];
  warnings: readonly { code: string; message?: string }[];
};

// Shopify's discount warnings, kept raw so the caller can tell which code
// each one is about (the message names the code).
export type DiscountWarning = { code: string; message: string };

function discountWarnings(
  payload: Payload | null | undefined,
): DiscountWarning[] {
  return (payload?.warnings ?? [])
    .filter((w) => w.code.startsWith("DISCOUNT_"))
    .map((w) => ({ code: w.code, message: w.message ?? "" }));
}

// Shopify reports an unknown, expired or completed cart as a user error on
// the cartId field.
function unwrap(
  operation: string,
  payload: Payload | null | undefined,
): CartRecord {
  if (payload?.userErrors.some((error) => error.field?.[0] === "cartId")) {
    throw new CartNotFoundError(operation);
  }
  assertNoUserErrors(operation, payload?.userErrors);
  if (!payload?.cart) throw new CartNotFoundError(operation);
  return toCart(payload.cart, payload.warnings);
}

// null when the cart is unknown, expired or completed.
export async function fetchCart(
  cartId: string,
  buyerIp: string | undefined,
): Promise<CartRecord | null> {
  const { cart } = await storefrontRequest(CartQuery, {
    variables: { cartId },
    buyerIp,
  });
  return cart ? toCart(cart, []) : null;
}

// customerAccessToken: a signed-in customer's, so the new cart (and its
// checkout) is theirs from the start.
export async function createCart(
  lines: CartLineInput[],
  buyerIp: string | undefined,
  customerAccessToken?: string,
  discountCodes: string[] = [],
): Promise<CartRecord> {
  const data = await storefrontRequest(CartCreate, {
    variables: {
      input: {
        lines,
        ...(customerAccessToken
          ? { buyerIdentity: { customerAccessToken } }
          : {}),
        ...(discountCodes.length ? { discountCodes } : {}),
      },
    },
    buyerIp,
  });
  return unwrap("CartCreate", data.cartCreate);
}

// A cart that starts with discount codes and no items (a discount link).
export async function createCartWithCodes(
  discountCodes: string[],
  buyerIp: string | undefined,
): Promise<{ cart: CartRecord; warnings: DiscountWarning[] }> {
  const data = await storefrontRequest(CartCreate, {
    variables: { input: { lines: [], discountCodes } },
    buyerIp,
  });
  return {
    cart: unwrap("CartCreate", data.cartCreate),
    warnings: discountWarnings(data.cartCreate),
  };
}

export async function addCartLines(
  cartId: string,
  lines: CartLineInput[],
  buyerIp: string | undefined,
): Promise<CartRecord> {
  const data = await storefrontRequest(CartLinesAdd, {
    variables: { cartId, lines },
    buyerIp,
  });
  return unwrap("CartLinesAdd", data.cartLinesAdd);
}

export async function updateCartLines(
  cartId: string,
  lines: CartLineUpdate[],
  buyerIp: string | undefined,
): Promise<CartRecord> {
  const data = await storefrontRequest(CartLinesUpdate, {
    variables: { cartId, lines },
    buyerIp,
  });
  return unwrap("CartLinesUpdate", data.cartLinesUpdate);
}

export async function removeCartLines(
  cartId: string,
  lineIds: string[],
  buyerIp: string | undefined,
): Promise<CartRecord> {
  const data = await storefrontRequest(CartLinesRemove, {
    variables: { cartId, lineIds },
    buyerIp,
  });
  return unwrap("CartLinesRemove", data.cartLinesRemove);
}

// Replaces the cart's codes with this list.
export async function setCartDiscountCodes(
  cartId: string,
  discountCodes: string[],
  buyerIp: string | undefined,
): Promise<{ cart: CartRecord; warnings: DiscountWarning[] }> {
  const data = await storefrontRequest(CartDiscountCodesUpdate, {
    variables: { cartId, discountCodes },
    buyerIp,
  });
  return {
    cart: unwrap("CartDiscountCodesUpdate", data.cartDiscountCodesUpdate),
    warnings: discountWarnings(data.cartDiscountCodesUpdate),
  };
}

// Adds a gift card code. Shopify answers an unknown, used-up or disabled
// code without an error, simply not applying it, so "applied" means a card
// ending in the code's last characters is now on the cart that wasn't
// before.
export async function addGiftCardCode(
  cartId: string,
  code: string,
  buyerIp: string | undefined,
  before: readonly { id: string; lastCharacters: string }[] = [],
): Promise<{
  cart: CartRecord | null;
  applied: boolean;
  alreadyApplied: boolean;
}> {
  const data = await storefrontRequest(CartGiftCardCodesAdd, {
    variables: { cartId, giftCardCodes: [code] },
    buyerIp,
  });
  const payload = data.cartGiftCardCodesAdd;
  if (payload?.userErrors.some((error) => error.field?.[0] === "cartId")) {
    throw new CartNotFoundError("CartGiftCardCodesAdd");
  }
  const cart = payload?.cart ? toCart(payload.cart, payload.warnings) : null;
  const known = new Set(before.map((card) => card.id));
  const ending = code.replace(/\s+/g, "").toLowerCase();
  // Applied: a card that wasn't on the cart before, ending as this code
  // does (a new card with another ending isn't this one).
  const matches = (card: { lastCharacters: string }) =>
    ending.endsWith(card.lastCharacters.toLowerCase());
  const applied =
    !payload?.userErrors.length &&
    !!cart?.giftCards.some((card) => !known.has(card.id) && matches(card));
  // Not new, but this code's card: it was on the cart already.
  const alreadyApplied = !applied && before.some(matches);
  return { cart, applied, alreadyApplied };
}

export async function removeGiftCards(
  cartId: string,
  appliedGiftCardIds: string[],
  buyerIp: string | undefined,
): Promise<CartRecord> {
  const data = await storefrontRequest(CartGiftCardCodesRemove, {
    variables: { cartId, appliedGiftCardIds },
    buyerIp,
  });
  return unwrap("CartGiftCardCodesRemove", data.cartGiftCardCodesRemove);
}

export const CartBuyerIdentityUpdate = gql(
  `
    mutation CartBuyerIdentityUpdate(
      $cartId: ID!
      $buyerIdentity: CartBuyerIdentityInput!
      $country: CountryCode
      $language: LanguageCode
      $visitorConsent: VisitorConsent
    ) @inContext(
      country: $country
      language: $language
      visitorConsent: $visitorConsent
    ) {
      cartBuyerIdentityUpdate(cartId: $cartId, buyerIdentity: $buyerIdentity) {
        cart {
          ...Cart
        }
        userErrors {
          ...CartPayloadErrors
        }
        warnings {
          code
        }
      }
    }
  `,
  [CartFragment, CartPayloadFragment],
);

// Ties the cart to a signed-in customer (checkout then knows who they are).
export async function linkCartToCustomer(
  cartId: string,
  customerAccessToken: string,
  buyerIp: string | undefined,
): Promise<CartRecord> {
  const data = await storefrontRequest(CartBuyerIdentityUpdate, {
    variables: { cartId, buyerIdentity: { customerAccessToken } },
    buyerIp,
  });
  return unwrap("CartBuyerIdentityUpdate", data.cartBuyerIdentityUpdate);
}
