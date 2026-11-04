import { HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";
import {
  handleBrowseRequest,
  handlePredictiveRequest,
} from "./browse-endpoint.server";
import predictive from "./testing/fixtures/PredictiveSearch.test.json";
import search from "./testing/fixtures/Search.tee.json";
import { published, replay, server, shopify } from "./testing/msw";

vi.mock("next/cache", () => ({ cacheLife: () => {}, cacheTag: () => {} }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-real-ip": "203.0.113.7" }),
}));

const on = { shopEnabled: () => true };
const get = (path: string) => new Request(`http://localhost${path}`);

describe("browse endpoint", () => {
  it("returns search results, uncached", async () => {
    server.use(replay("Search", search));
    const response = await handleBrowseRequest(
      get("/api/commerce/browse?q=tee&sort_by=price-ascending"),
      on,
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    const body = await response.json();
    expect(body.totalCount).toBe(search.data.search.totalCount);
    expect(body.closeMatches).toBeUndefined();
  });

  it("shows predictive search's typo-forgiving matches when search finds nothing", async () => {
    const none = structuredClone(search);
    none.data.search.nodes = [];
    none.data.search.totalCount = 0;
    let predicted = 0;
    server.use(
      replay("Search", none),
      shopify.query("PredictiveSearch", ({ variables }) => {
        predicted++;
        expect(variables.query).toBe("tea");
        return HttpResponse.json(predictive);
      }),
    );
    const typo = await (
      await handleBrowseRequest(get("/api/commerce/browse?q=tea"), on)
    ).json();
    const handles = predictive.data.predictiveSearch.products.map(
      (product) => product.handle,
    );
    expect(
      typo.products.items.map((item: { handle: string }) => item.handle),
    ).toEqual(handles);
    // Marked as close matches, and not counted as results for the term.
    expect(typo.closeMatches).toBe(true);
    expect(typo.totalCount).toBe(0);

    // Not when filters narrowed a search to nothing: that empty is real.
    const filtered = await (
      await handleBrowseRequest(
        get("/api/commerce/browse?q=tea&filter.v.availability=1"),
        on,
      )
    ).json();
    expect(filtered.totalCount).toBe(0);
    expect(filtered.closeMatches).toBeUndefined();
    expect(predicted).toBe(1);
  });

  it("keeps an empty search's result when close matches can't load", async () => {
    const none = structuredClone(search);
    none.data.search.nodes = [];
    none.data.search.totalCount = 0;
    server.use(
      replay("Search", none),
      shopify.query("PredictiveSearch", () => HttpResponse.error()),
    );
    const response = await handleBrowseRequest(
      get("/api/commerce/browse?q=tea"),
      on,
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.totalCount).toBe(0);
    expect(body.closeMatches).toBeUndefined();
  });

  it("404s for a collection that isn't published", async () => {
    // Not in the published list: Shopify isn't asked for the listing.
    let asked = 0;
    server.use(
      ...published({ collections: ["test-apparel"] }),
      shopify.query("CollectionListing", () => {
        asked++;
        return HttpResponse.json({ data: { collection: null } });
      }),
    );
    const response = await handleBrowseRequest(
      get("/api/commerce/browse?collection=test-hidden-collection"),
      on,
    );
    expect(response.status).toBe(404);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(asked).toBe(0);
  });

  it.each([
    "/api/commerce/browse",
    "/api/commerce/browse?collection=../x",
    "/api/commerce/browse?q=%20%20",
  ])("rejects %s", async (path) => {
    expect((await handleBrowseRequest(get(path), on)).status).toBe(400);
  });

  it("searches up to 200 characters and refuses longer, without asking Shopify", async () => {
    const asked: unknown[] = [];
    server.use(
      shopify.query("Search", ({ variables }) => {
        asked.push(variables.query);
        return HttpResponse.json(search);
      }),
    );
    const at200 = await handleBrowseRequest(
      get(`/api/commerce/browse?q=${"t".repeat(200)}`),
      on,
    );
    const at201 = await handleBrowseRequest(
      get(`/api/commerce/browse?q=${"t".repeat(201)}`),
      on,
    );
    expect([at200.status, at201.status]).toEqual([200, 400]);
    expect(asked).toEqual(["t".repeat(200)]);
  });

  it("answers 400, not 503, when Shopify rejects the filters", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    server.use(
      shopify.query("Search", () =>
        HttpResponse.json({
          errors: [
            {
              message: "Invalid filter",
              extensions: { code: "BAD_USER_INPUT" },
            },
          ],
        }),
      ),
    );
    const response = await handleBrowseRequest(
      get("/api/commerce/browse?q=tee&filter.v.option.Color=x"),
      on,
    );
    expect(response.status).toBe(400);
  });

  it("404s while the shop is off", async () => {
    expect(
      (
        await handleBrowseRequest(get("/api/commerce/browse?q=tee"), {
          shopEnabled: () => false,
        })
      ).status,
    ).toBe(404);
  });
});

describe("predictive search endpoint", () => {
  it("answers an empty result for a blank term without calling Shopify", async () => {
    const response = await handlePredictiveRequest(
      get("/api/commerce/predictive-search?q="),
      on,
    );
    expect(await response.json()).toEqual({
      products: [],
      collections: [],
      queries: [],
    });
  });
});

describe("predictive search endpoint", () => {
  it("answers empty for a term over 100 characters, without asking Shopify", async () => {
    let asked = 0;
    server.use(
      shopify.query("PredictiveSearch", () => {
        asked++;
        return HttpResponse.json({ data: { predictiveSearch: null } });
      }),
    );
    const response = await handlePredictiveRequest(
      get(`/api/commerce/predictive-search?q=${"t".repeat(101)}`),
      on,
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      products: [],
      collections: [],
      queries: [],
    });
    expect(asked).toBe(0);
  });
});
