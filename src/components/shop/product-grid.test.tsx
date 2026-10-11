import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { Listing } from "@/lib/commerce";
import { handleBrowseRequest } from "@/lib/commerce/browse-endpoint.server";
import apparel from "@/lib/commerce/testing/fixtures/CollectionListing.test-apparel.json";
import search from "@/lib/commerce/testing/fixtures/Search.tee.json";
import { published, replay, server } from "@/lib/commerce/testing/msw";
import { ProductGrid } from "./product-grid";

vi.mock("next/cache", () => ({ cacheLife: () => {}, cacheTag: () => {} }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-real-ip": "203.0.113.7" }),
}));

// Listing pages render tiles from the browse endpoint's JSON, so its tiles
// must carry everything a server-rendered tile has. Runs in Node: Hydrogen
// refuses the private token wherever a DOM exists.
describe("product tiles from the browse endpoint", () => {
  it.each([
    [
      "a filtered collection",
      "CollectionListing",
      apparel,
      "/api/commerce/browse?collection=test-apparel&filter.v.availability=1",
    ],
    ["search results", "Search", search, "/api/commerce/browse?q=tee"],
  ])("render %s", async (_, operation, fixture, path) => {
    server.use(
      ...published({ collections: ["test-apparel"] }),
      replay(operation, fixture),
    );
    const response = await handleBrowseRequest(
      new Request(`http://localhost${path}`),
      { shopEnabled: () => true },
    );
    const listing: Listing = await response.json();
    const tiles = listing.products.items;
    expect(tiles.length).toBeGreaterThan(0);
    for (const tile of tiles) {
      expect(Object.keys(tile).sort()).toEqual([
        "available",
        "badges",
        "featuredImage",
        "handle",
        "id",
        "isGiftCard",
        "price",
        "prop65",
        "quickAddVariantId",
        "reviews",
        "title",
        "trackingParameters",
      ]);
      expect(tile.price.min.currencyCode).toBe("USD");
    }
    const html = renderToStaticMarkup(<ProductGrid products={tiles} />);
    expect(html.match(/<article>/g)).toHaveLength(tiles.length);
    expect(html).toMatch(/\$\d/);
  });
});

describe("image loading", () => {
  const tiles = apparel.data.collection.products.nodes;
  const cards = async () => {
    server.use(
      ...published({ collections: ["test-apparel"] }),
      replay("CollectionListing", apparel),
    );
    const response = await handleBrowseRequest(
      new Request(
        "http://localhost/api/commerce/browse?collection=test-apparel&filter.v.availability=1",
      ),
      { shopEnabled: () => true },
    );
    return ((await response.json()) as Listing).products.items;
  };

  it("loads a leading grid's first row eagerly and its first image first", async () => {
    const html = renderToStaticMarkup(<ProductGrid products={await cards()} />);
    const images = html.match(/<img[^>]*>/g) ?? [];
    expect(images.length).toBe(tiles.filter((t) => t.featuredImage).length);
    expect(
      images.filter((img) => /fetchPriority="high"/i.test(img)),
    ).toHaveLength(1);
    expect(images.filter((img) => /loading="eager"/.test(img)).length).toBe(
      Math.min(4, images.length),
    );
  });

  it("loads a grid further down the page lazily", async () => {
    const html = renderToStaticMarkup(
      <ProductGrid products={await cards()} aboveFold={false} />,
    );
    expect(html).not.toMatch(/fetchPriority|rel="preload"/i);
    expect(html).not.toMatch(/loading="eager"/);
  });
});

describe("badges", () => {
  it("shows a tile's badges as text in a labeled list", () => {
    const html = renderToStaticMarkup(
      <ProductGrid
        products={[
          {
            id: "gid://shopify/Product/1",
            handle: "synthetic",
            title: "Synthetic",
            featuredImage: null,
            price: {
              min: { amount: "10.0", currencyCode: "USD" },
              max: { amount: "10.0", currencyCode: "USD" },
            },
            available: false,
            trackingParameters: null,
            badges: [
              { kind: "soldOut", label: "Sold out" },
              { kind: "merchant", label: "Best seller" },
            ],
          },
        ]}
      />,
    );
    expect(html).toContain(
      '<ul aria-label="Product badges"><li data-badge="soldOut">Sold out</li><li data-badge="merchant">Best seller</li></ul>',
    );
  });

  it("marks products new by today's date, in a listing too", async () => {
    // Search.tee was recorded from products published 2026-10-07.
    vi.useFakeTimers({
      toFake: ["Date"],
      now: Date.parse("2026-10-09T00:00:00Z"),
    });
    try {
      server.use(replay("Search", search));
      const response = await handleBrowseRequest(
        new Request("http://localhost/api/commerce/browse?q=tee"),
        { shopEnabled: () => true },
      );
      const { products }: Listing = await response.json();
      for (const tile of products.items) {
        expect(tile.badges).toContainEqual({ kind: "new", label: "New" });
      }
    } finally {
      vi.useRealTimers();
    }
  });
});
