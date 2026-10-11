import { HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import cards from "../../testing/fixtures/ProductCards.first-page.json";
import complete from "../../testing/fixtures/ProductContent.the-complete-snowboard.json";
import { replay, server, shopify } from "../../testing/msw";
import { toProductContent } from "../transforms/product";
import {
  fetchProductCards,
  fetchProductContent,
  type ProductContentData,
} from "./products";

describe("fetchProductContent", () => {
  it("returns domain content for a published product", async () => {
    server.use(replay("ProductContent", complete));

    const product = await fetchProductContent("the-complete-snowboard");

    expect(product?.content).toEqual(
      toProductContent(complete.data.product as ProductContentData),
    );
    // The default variant comes from the same read.
    expect(product?.defaultView.variant?.id).toBe(
      complete.data.product.selectedOrFirstAvailableVariant?.id,
    );
  });

  it("sends the handle and the store locale", async () => {
    let variables: Record<string, unknown> = {};
    server.use(
      shopify.query("ProductContent", (request) => {
        variables = request.variables;
        return HttpResponse.json({ data: { product: null } });
      }),
    );

    await fetchProductContent("the-complete-snowboard");

    expect(variables).toMatchObject({
      handle: "the-complete-snowboard",
      country: "US",
      language: "EN",
    });
  });

  it("returns null for an unknown or unpublished handle", async () => {
    server.use(
      shopify.query("ProductContent", () =>
        HttpResponse.json({ data: { product: null } }),
      ),
    );

    expect(await fetchProductContent("no-such-product")).toBeNull();
  });
});

describe("fetchProductCards", () => {
  it("returns tiles and the next-page cursor", async () => {
    let variables: Record<string, unknown> = {};
    server.use(
      shopify.query("ProductCards", (request) => {
        variables = request.variables;
        return HttpResponse.json(cards);
      }),
    );

    const page = await fetchProductCards({ first: 5 });

    expect(variables).toMatchObject({ first: 5, country: "US" });
    expect(page.items).toHaveLength(5);
    expect(page.items[0]).toMatchObject({
      id: "gid://shopify/Product/8838223954126",
      handle: "gift-card",
      title: "Gift Card",
      price: { min: { currencyCode: "USD" } },
      featuredImage: expect.objectContaining({
        url: expect.stringMatching(/^https:\/\/cdn\.shopify\.com\//),
      }),
    });
    expect(page.nextCursor).toBe(cards.data.products.pageInfo.endCursor);
  });

  it("has no cursor on the last page", async () => {
    server.use(
      replay("ProductCards", {
        data: {
          products: {
            nodes: [],
            pageInfo: { hasNextPage: false, endCursor: null },
          },
        },
      }),
    );

    expect(await fetchProductCards({ first: 5, after: "cursor" })).toEqual({
      items: [],
      nextCursor: null,
      previousCursor: null,
    });
  });
});
