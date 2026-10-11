import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { storefrontRequest } from "../shopify/client.server";
import {
  ProductCardsQuery,
  ProductContentQuery,
  ProductRecommendationsQuery,
} from "../shopify/operations/products";
import { MenuQuery } from "../shopify/operations/menu";
import {
  ShopIdQuery,
  ShopLocalizationQuery,
  ShopPoliciesQuery,
} from "../shopify/operations/shop";
import {
  CartCreate,
  CartDiscountCodesUpdate,
  CartGiftCardCodesAdd,
  CartLinesAdd,
} from "../shopify/operations/cart";
import {
  CartFixtureIdsQuery,
  DiscountFixtureIdsQuery,
  VariantMatrixQuery,
} from "../shopify/operations/fixture-queries";
import {
  AllProductsQuery,
  CollectionHandlesQuery,
  CollectionListingQuery,
  PredictiveSearchQuery,
  SearchQuery,
} from "../shopify/operations/listings";
import { VariantViewQuery } from "../shopify/operations/variants";
import { synthesize } from "./synthesize";

// Records raw Storefront API responses from the dev store into fixtures/.
// Run with `pnpm fixtures:record`. The dev store holds synthetic products
// only; the recorder still refuses anything that looks like an email
// address or phone number, swaps the store's domain and handle (the default
// vendor) for synthetic ones, and replaces cart tokens and access keys with
// stable synthetic stand-ins.

const FIXTURES = join(import.meta.dirname, "fixtures");

const productHandles = [
  "the-complete-snowboard", // options with several values
  "selling-plans-ski-wax", // selling plans
  "the-videographer-snowboard", // external video
  "the-minimal-snowboard", // no media
  "test-tee-3-option", // three options, per-color images
  "test-electrolytes", // two options, optional subscription
  "test-long-title", // unicode and HTML in the title, script in the description
  "test-subscription-only", // requires a selling plan
  "gift-card", // a gift card (recipient details)
  "the-out-of-stock-snowboard", // sold out
];

function save(name: string, data: unknown) {
  const storeDomain = process.env.SHOPIFY_STORE_DOMAIN!;
  const json = synthesize(JSON.stringify({ data }, null, 2), storeDomain);
  expect(json, `${name} names the real store`).not.toContain(
    storeDomain.replace(/\.myshopify\.com$/, ""),
  );
  expect(json, `${name} looks like it holds an email`).not.toMatch(
    /[\w.+-]+@[\w-]+\.[\w.]+/,
  );
  expect(json, `${name} looks like it holds a phone number`).not.toMatch(
    /\+\d{10,}/,
  );
  mkdirSync(FIXTURES, { recursive: true });
  writeFileSync(join(FIXTURES, `${name}.json`), `${json}\n`);
}

const variantViews: [string, string, { name: string; value: string }[]][] = [
  ["the-complete-snowboard", "ice", [{ name: "color", value: "ice" }]],
  [
    "the-complete-snowboard",
    "unknown-option",
    [{ name: "Flavor", value: "Lemon" }],
  ],
  ["selling-plans-ski-wax", "default", []],
  ["the-out-of-stock-snowboard", "default", []],
  // Black / XL is sold out; an M / Tall combination doesn't exist.
  [
    "test-tee-3-option",
    "black-xl",
    [
      { name: "color", value: "black" },
      { name: "size", value: "xl" },
    ],
  ],
  ["test-sold-out", "default", []],
  ["test-electrolytes", "default", []],
];

describe("record fixtures", () => {
  it.each(variantViews)(
    "VariantView %s %s",
    async (handle, key, selectedOptions) => {
      const data = await storefrontRequest(VariantViewQuery, {
        variables: { handle, selectedOptions },
      });
      expect(data.product).toBeTruthy();
      save(`VariantView.${handle}.${key}`, data);
    },
  );

  it.each([
    "the-complete-snowboard",
    "selling-plans-ski-wax",
    "test-tee-3-option",
    "test-150-variants",
  ])("VariantMatrix %s", async (handle) => {
    const data = await storefrontRequest(VariantMatrixQuery, {
      variables: { handle },
    });
    save(`VariantMatrix.${handle}`, data);
  });

  it.each(productHandles)("ProductContent %s", async (handle) => {
    const data = await storefrontRequest(ProductContentQuery, {
      variables: { handle },
    });
    expect(data.product, `${handle} isn't published to Headless`).toBeTruthy();
    save(`ProductContent.${handle}`, data);
  });

  it("ProductCards first page", async () => {
    const data = await storefrontRequest(ProductCardsQuery, {
      variables: { first: 5 },
    });
    expect(data.products.pageInfo.hasNextPage).toBe(true);
    save("ProductCards.first-page", data);
  });

  // Each run creates a few carts in the dev store; they're abandoned.
  it("Cart fixtures", async () => {
    const ids = await storefrontRequest(CartFixtureIdsQuery);
    const wax = ids.wax!.variants.nodes[0].id;
    const plan = ids.wax!.sellingPlanGroups.nodes[0].sellingPlans.nodes[0].id;
    const soldOut = ids.soldOut!.variants.nodes[0].id;

    save(
      "CartCreate.one-time-and-subscription",
      await storefrontRequest(CartCreate, {
        variables: {
          input: {
            lines: [
              { merchandiseId: wax, quantity: 1 },
              { merchandiseId: wax, quantity: 2, sellingPlanId: plan },
            ],
          },
        },
      }),
    );
    save(
      "CartCreate.sold-out",
      await storefrontRequest(CartCreate, {
        variables: {
          input: { lines: [{ merchandiseId: soldOut, quantity: 1 }] },
        },
      }),
    );
    save(
      "CartCreate.not-enough-stock",
      await storefrontRequest(CartCreate, {
        variables: {
          input: { lines: [{ merchandiseId: wax, quantity: 100000 }] },
        },
      }),
    );
    // A subscription-only product added without a plan.
    save(
      "CartCreate.plan-required",
      await storefrontRequest(CartCreate, {
        variables: {
          input: {
            lines: [
              {
                merchandiseId: ids.planOnly!.variants.nodes[0].id,
                quantity: 1,
              },
            ],
          },
        },
      }),
    );
    save(
      "CartLinesAdd.unknown-cart",
      await storefrontRequest(CartLinesAdd, {
        variables: {
          cartId:
            "gid://shopify/Cart/hWN0000000000000000000000000000000?key=00000000000000000000000000000000",
          lines: [{ merchandiseId: wax, quantity: 1 }],
        },
      }),
    );
  });

  // A gift card applied to a cart. The card's code is only ever read from
  // the environment (GIFT_CARD_CODE) when recording; the fixture keeps no
  // trace of it (its id and last characters are replaced).
  it.skipIf(!process.env.GIFT_CARD_CODE)("Gift card fixture", async () => {
    const ids = await storefrontRequest(CartFixtureIdsQuery);
    const created = await storefrontRequest(CartCreate, {
      variables: {
        input: {
          lines: [
            { merchandiseId: ids.wax!.variants.nodes[0].id, quantity: 1 },
          ],
        },
      },
    });
    const data = await storefrontRequest(CartGiftCardCodesAdd, {
      variables: {
        cartId: created.cartCreate!.cart!.id,
        giftCardCodes: [process.env.GIFT_CARD_CODE!],
      },
    });
    const cart = data.cartGiftCardCodesAdd!.cart!;
    expect(cart.appliedGiftCards).toHaveLength(1);
    // The same card again: already on the cart.
    const again = await storefrontRequest(CartGiftCardCodesAdd, {
      variables: {
        cartId: created.cartCreate!.cart!.id,
        giftCardCodes: [process.env.GIFT_CARD_CODE!],
      },
    });
    const scrub = (payload: typeof data) => ({
      ...payload,
      cartGiftCardCodesAdd: {
        ...payload.cartGiftCardCodesAdd,
        cart: payload.cartGiftCardCodesAdd!.cart && {
          ...payload.cartGiftCardCodesAdd!.cart,
          appliedGiftCards:
            payload.cartGiftCardCodesAdd!.cart.appliedGiftCards.map((card) => ({
              ...card,
              id: "gid://shopify/AppliedGiftCard/1",
              lastCharacters: "0000",
            })),
        },
      },
    });
    save("CartGiftCardCodesAdd.already-applied", scrub(again));
    save("CartGiftCardCodesAdd.applied", {
      ...data,
      cartGiftCardCodesAdd: {
        ...data.cartGiftCardCodesAdd,
        cart: {
          ...cart,
          appliedGiftCards: cart.appliedGiftCards.map((card) => ({
            ...card,
            id: "gid://shopify/AppliedGiftCard/1",
            lastCharacters: "0000",
          })),
        },
      },
    });
  });

  // Discount codes from the dev store's synthetic set (TEST*).
  it("Discount fixtures", async () => {
    const ids = await storefrontRequest(DiscountFixtureIdsQuery);
    const tee = ids.tee!.variants.nodes[0].id;
    const created = await storefrontRequest(CartCreate, {
      variables: { input: { lines: [{ merchandiseId: tee, quantity: 1 }] } },
    });
    const cartId = created.cartCreate!.cart!.id;
    for (const [key, code] of [
      ["applied", "TEST10"],
      ["minimum-not-met", "TEST5OFF"],
      ["not-found", "NOPE123"],
    ]) {
      save(
        `CartDiscountCodesUpdate.${key}`,
        await storefrontRequest(CartDiscountCodesUpdate, {
          variables: { cartId, discountCodes: [code] },
        }),
      );
    }
    save(
      "CartCreate.code-only",
      await storefrontRequest(CartCreate, {
        variables: { input: { discountCodes: ["TEST10"] } },
      }),
    );
  }, 60_000);

  it("Listing fixtures", async () => {
    const collection = (handle: string, extra: object = {}) =>
      storefrontRequest(CollectionListingQuery, {
        variables: { handle, first: 24, ...extra },
      });
    save("CollectionListing.test-apparel", await collection("test-apparel"));
    save(
      "CollectionListing.test-apparel.navy-price-asc",
      await collection("test-apparel", {
        filters: [{ variantOption: { name: "Color", value: "Navy" } }],
        sortKey: "PRICE",
      }),
    );
    save("CollectionListing.test-empty", await collection("test-empty"));
    save(
      "CollectionListing.test-hidden-collection",
      await collection("test-hidden-collection"),
    );
    save(
      "CollectionListing.test-all.page-size-2",
      await collection("test-all", { first: 2 }),
    );
    save(
      "AllProducts.first-page",
      await storefrontRequest(AllProductsQuery, {
        variables: { first: 3, sortKey: "TITLE" },
      }),
    );
    save(
      "Search.tee",
      await storefrontRequest(SearchQuery, {
        variables: { query: "tee", first: 24, sortKey: "RELEVANCE" },
      }),
    );
    save(
      "PredictiveSearch.test",
      await storefrontRequest(PredictiveSearchQuery, {
        variables: { query: "test", limit: 6 },
      }),
    );
  }, 60_000);

  // What the rest of the site reads (the end-to-end tests' synthetic store
  // serves these too).
  it("Shop and recommendation fixtures", async () => {
    save("ShopId", await storefrontRequest(ShopIdQuery));
    save("ShopLocalization", await storefrontRequest(ShopLocalizationQuery));
    // Policy text is the store's own (contact details included): only the
    // titles and handles are kept.
    const { shop } = await storefrontRequest(ShopPoliciesQuery);
    save("ShopPolicies", {
      shop: Object.fromEntries(
        Object.entries(shop).map(([key, policy]) => [
          key,
          policy && {
            ...policy,
            body: `<p>Synthetic ${policy.title.toLowerCase()} text.</p>`,
          },
        ]),
      ),
    });
    save(
      "CollectionHandles.first-page",
      await storefrontRequest(CollectionHandlesQuery),
    );
    for (const handle of ["main-menu", "footer"]) {
      save(
        `Menu.${handle}`,
        await storefrontRequest(MenuQuery, { variables: { handle } }),
      );
    }
    for (const intent of ["RELATED", "COMPLEMENTARY"] as const) {
      save(
        `ProductRecommendations.test-electrolytes.${intent.toLowerCase()}`,
        await storefrontRequest(ProductRecommendationsQuery, {
          variables: { handle: "test-electrolytes", intent },
        }),
      );
    }
  }, 60_000);
});
