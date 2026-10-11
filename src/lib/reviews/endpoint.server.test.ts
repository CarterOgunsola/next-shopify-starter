import { describe, expect, it, vi } from "vitest";

const catalog = vi.hoisted(() => ({
  getProductAtRequest: vi.fn(async (_ctx: unknown, handle: string) =>
    handle === "test-electrolytes"
      ? { content: { id: "gid://shopify/Product/5550001" } }
      : null,
  ),
}));
vi.mock("@/lib/commerce/catalog.server", () => catalog);
const reviews = vi.hoisted(() => ({
  loadReviewPage: vi.fn(async (_handle: string, _id: string, page: number) => ({
    reviews: [],
    page,
    hasMore: false,
  })),
}));
vi.mock("./reviews.server", () => reviews);

const { handleReviewsRequest } = await import("./endpoint.server");
const on = { shopEnabled: () => true };
const get = (query: string) =>
  handleReviewsRequest(
    new Request(`https://local.test/api/reviews?${query}`),
    on,
  );

describe("GET /api/reviews", () => {
  it("serves a later page of a product's reviews, briefly shared-cached", async () => {
    const response = await get("handle=test-electrolytes&page=2");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      reviews: [],
      page: 2,
      hasMore: false,
    });
    expect(response.headers.get("cache-control")).toContain("s-maxage=300");
    expect(reviews.loadReviewPage).toHaveBeenCalledWith(
      "test-electrolytes",
      "gid://shopify/Product/5550001",
      2,
    );
  });

  it.each([
    "handle=../x&page=2",
    "handle=test-electrolytes&page=0",
    "handle=test-electrolytes&page=51",
    "handle=test-electrolytes",
  ])("refuses %s", async (query) => {
    expect((await get(query)).status).toBe(400);
  });

  it("404s for a product that isn't published, and while the shop is off", async () => {
    expect((await get("handle=test-gone&page=2")).status).toBe(404);
    const off = await handleReviewsRequest(
      new Request(
        "https://local.test/api/reviews?handle=test-electrolytes&page=2",
      ),
      { shopEnabled: () => false },
    );
    expect(off.status).toBe(404);
  });
});
