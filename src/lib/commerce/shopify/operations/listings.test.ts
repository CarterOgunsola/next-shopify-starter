import { HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import apparel from "../../testing/fixtures/CollectionListing.test-apparel.json";
import hidden from "../../testing/fixtures/CollectionListing.test-hidden-collection.json";
import pageOfTwo from "../../testing/fixtures/CollectionListing.test-all.page-size-2.json";
import all from "../../testing/fixtures/AllProducts.first-page.json";
import predictive from "../../testing/fixtures/PredictiveSearch.test.json";
import search from "../../testing/fixtures/Search.tee.json";
import { replay, server, shopify } from "../../testing/msw";
import { parseBrowseParams } from "../browse-params";
import {
  fetchAllProducts,
  fetchCollectionListing,
  fetchPredictive,
  fetchSearch,
} from "./listings";

const params = (query = "") => parseBrowseParams(new URLSearchParams(query));

describe("listings", () => {
  it("maps a collection with facets", async () => {
    server.use(replay("CollectionListing", apparel));
    const found = await fetchCollectionListing(
      "test-apparel",
      params(),
      undefined,
    );
    expect(found?.collection.handle).toBe("test-apparel");
    // Availability and price always; option facets (Color, Size) as
    // configured in Search & Discovery.
    const facets = found?.listing.facets.map((f) => [f.label, f.type]);
    expect(facets).toEqual(
      expect.arrayContaining([
        ["Availability", "list"],
        ["Price", "price"],
        ["Color", "list"],
      ]),
    );
    expect(found?.listing.products.items[0].price.min.currencyCode).toBe("USD");
  });

  it("is null for a collection that isn't on Headless", async () => {
    server.use(replay("CollectionListing", hidden));
    expect(
      await fetchCollectionListing(
        "test-hidden-collection",
        params(),
        undefined,
      ),
    ).toBeNull();
  });

  it("passes filters, sort and cursors through and maps page cursors", async () => {
    let variables: Record<string, unknown> = {};
    server.use(
      shopify.query("CollectionListing", (request) => {
        variables = request.variables;
        return HttpResponse.json(pageOfTwo);
      }),
    );
    const found = await fetchCollectionListing(
      "test-all",
      params("filter.v.option.Color=Navy&sort_by=price-descending&before=abc"),
      undefined,
    );
    expect(variables).toMatchObject({
      filters: [{ variantOption: { name: "Color", value: "Navy" } }],
      sortKey: "PRICE",
      reverse: true,
      last: 24,
      before: "abc",
    });
    expect(found?.listing.products.nextCursor).toBeTruthy();
    expect(found?.listing.products.previousCursor).toBeNull();
  });

  it("lists all products with product sort keys", async () => {
    let variables: Record<string, unknown> = {};
    server.use(
      shopify.query("AllProducts", (request) => {
        variables = request.variables;
        return HttpResponse.json(all);
      }),
    );
    const listing = await fetchAllProducts(
      params("sort_by=created-descending"),
      undefined,
    );
    expect(variables).toMatchObject({ sortKey: "CREATED_AT", reverse: true });
    expect(listing.facets).toEqual([]);
    expect(listing.products.items.length).toBe(3);
  });

  it("searches products with relevance or price only", async () => {
    let variables: Record<string, unknown> = {};
    server.use(
      shopify.query("Search", (request) => {
        variables = request.variables;
        return HttpResponse.json(search);
      }),
    );
    const listing = await fetchSearch(
      "tee",
      params("sort_by=best-selling"),
      undefined,
    );
    expect(variables).toMatchObject({
      query: "tee",
      sortKey: "RELEVANCE",
      reverse: false,
    });
    expect(listing.totalCount).toBe(search.data.search.totalCount);
    expect(listing.products.items.map((p) => p.handle)).toContain(
      "test-tee-3-option",
    );
  });

  it("returns predictive suggestions", async () => {
    server.use(replay("PredictiveSearch", predictive));
    const results = await fetchPredictive("test", 6, undefined);
    expect(results.products).toHaveLength(6);
    expect(results.products[0].handle).toMatch(/^test-/);
  });
});
