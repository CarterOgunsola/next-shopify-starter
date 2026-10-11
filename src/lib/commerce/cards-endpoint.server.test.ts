import { HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";
import cards from "./testing/fixtures/ProductCards.first-page.json";
import { handleCardsRequest } from "./cards-endpoint.server";
import { published, server, shopify } from "./testing/msw";
import type { ProductCard } from "./types";

vi.mock("next/cache", () => ({ cacheLife: () => {}, cacheTag: () => {} }));

const nodes = cards.data.products.nodes;
const get = (query: string, on = true) =>
  handleCardsRequest(
    new Request(`https://local.test/api/commerce/cards?${query}`),
    { shopEnabled: () => on },
  );

describe("GET /api/commerce/cards", () => {
  it("gives current cards in the order asked, for published products only", async () => {
    const asked: string[] = [];
    server.use(
      ...published({
        products: ["test-backorder", "test-subscription-only"],
      }),
      shopify.query("ProductCardByHandle", ({ variables }) => {
        asked.push(variables.handle as string);
        return HttpResponse.json({
          data: { product: nodes.find((n) => n.handle === variables.handle) },
        });
      }),
    );
    const response = await get(
      "handles=test-subscription-only,gone,test-backorder",
    );
    expect(response.headers.get("cache-control")).toContain("s-maxage=300");
    const { products }: { products: ProductCard[] } = await response.json();
    expect(products.map((p) => p.handle)).toEqual([
      "test-subscription-only",
      "test-backorder",
    ]);
    expect(asked).not.toContain("gone");
  });

  it("answers 503 while Shopify is briefly unavailable", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    server.use(
      ...published({ products: ["test-backorder"] }),
      shopify.query(
        "ProductCardByHandle",
        () => new HttpResponse(null, { status: 503 }),
      ),
    );
    const response = await get("handles=test-backorder");
    expect(response.status).toBe(503);
    expect(response.headers.get("retry-after")).toBe("5");
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("refuses junk, too many handles, and 404s while the shop is off", async () => {
    expect((await get("handles=../x")).status).toBe(400);
    expect((await get("handles=")).status).toBe(400);
    expect(
      (await get(`handles=${"abcdefghi".split("").join(",")}`)).status,
    ).toBe(400);
    expect((await get("handles=a", false)).status).toBe(404);
  });
});
