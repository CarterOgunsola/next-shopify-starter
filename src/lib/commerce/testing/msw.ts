import { http, HttpResponse } from "msw";
import { graphql } from "msw/graphql";
import { setupServer } from "msw/node";
import { API_VERSION } from "../config.server";

// One MSW server for every test file (started in test/setup.ts). Add
// handlers per test with server.use(...); they reset after each test.

export const TEST_STORE_DOMAIN = "synthetic-store.myshopify.com";

export const STOREFRONT_ENDPOINT = `https://${TEST_STORE_DOMAIN}/api/${API_VERSION}/graphql.json`;

// Storefront API operations, matched by operation name:
// server.use(shopify.query("ProductContent", resolver))
export const shopify = graphql.link(STOREFRONT_ENDPOINT);

// Last in line: any request no test handles fails loudly. MSW's own
// unhandled-request check lets GraphQL requests to a graphql.link URL
// through to the network when no operation matches, so it isn't enough.
const failUnhandled = http.all("*", ({ request }) => {
  console.error(`[test] unhandled request: ${request.method} ${request.url}`);
  return HttpResponse.error();
});

export const server = setupServer(failUnhandled);

// Serves a recorded fixture ({ data }) for an operation.
export function replay(
  operation: string,
  fixture: { data: unknown },
  kind: "query" | "mutation" = "query",
) {
  return shopify[kind](operation, () =>
    HttpResponse.json(fixture as { data: Record<string, unknown> }),
  );
}

const EMPTY_PAGE = {
  hasNextPage: false,
  hasPreviousPage: false,
  startCursor: null,
  endCursor: null,
};
const usd = (amount: string) => ({ amount, currencyCode: "USD" });

// The published handle lists the catalog checks before any per-handle read.
export function published({
  products = [],
  collections = [],
}: {
  products?: string[];
  collections?: string[];
}) {
  return [
    shopify.query("ProductCards", () =>
      HttpResponse.json({
        data: {
          products: {
            nodes: products.map((handle) => ({
              id: `gid://shopify/Product/${handle}`,
              handle,
              title: handle,
              availableForSale: true,
              featuredImage: null,
              requiresSellingPlan: false,
              reviewRating: null,
              reviewCount: null,
              isGiftCard: false,
              variants: { pageInfo: { hasNextPage: false }, nodes: [] },
              priceRange: {
                minVariantPrice: usd("1.0"),
                maxVariantPrice: usd("1.0"),
              },
              publishedAt: "2020-01-01T00:00:00Z",
              merchantBadges: null,
            })),
            pageInfo: EMPTY_PAGE,
          },
        },
      }),
    ),
    shopify.query("CollectionHandles", () =>
      HttpResponse.json({
        data: {
          collections: {
            nodes: collections.map((handle) => ({ handle })),
            pageInfo: EMPTY_PAGE,
          },
        },
      }),
    ),
  ];
}

// The Customer Account API for the synthetic shop id 7 (tests mock the shop
// id lookup). Its fixtures are hand-written to the schema with synthetic
// data: recording them needs a real signed-in session.
export const TEST_SHOP_ID = "7";
export const CUSTOMER_ACCOUNT_ENDPOINT = `https://shopify.com/${TEST_SHOP_ID}/account/customer/api/2026-10/graphql`;
export const customerAccount = graphql.link(CUSTOMER_ACCOUNT_ENDPOINT);
