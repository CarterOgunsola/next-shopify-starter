import { describe, expect, it, vi } from "vitest";
import { ShopifyTransientError } from "./shopify/errors";

const catalog = vi.hoisted(() => ({
  getRecommendationsAtRequest: vi.fn(async () => [
    { handle: "test-subscription-only" },
  ]),
}));
vi.mock("./catalog.server", () => catalog);

const { handleRecommendationsRequest } =
  await import("./recommendations-endpoint.server");
const get = (query: string, on = true) =>
  handleRecommendationsRequest(
    new Request(`https://local.test/api/commerce/recommendations?${query}`),
    { shopEnabled: () => on },
  );

describe("GET /api/commerce/recommendations", () => {
  it("gives what pairs well with a product, briefly shared-cached", async () => {
    const response = await get("handle=test-electrolytes");
    expect(await response.json()).toEqual({
      products: [{ handle: "test-subscription-only" }],
    });
    expect(response.headers.get("cache-control")).toContain("s-maxage=300");
    expect(catalog.getRecommendationsAtRequest).toHaveBeenCalledWith(
      expect.anything(),
      "test-electrolytes",
      "COMPLEMENTARY",
    );
  });

  it("answers 503 while Shopify is briefly unavailable", async () => {
    catalog.getRecommendationsAtRequest.mockRejectedValueOnce(
      new ShopifyTransientError("ProductRecommendations", "throttled"),
    );
    const response = await get("handle=test-electrolytes");
    expect(response.status).toBe(503);
    expect(response.headers.get("retry-after")).toBe("5");
  });

  it("refuses a bad handle and 404s while the shop is off", async () => {
    expect((await get("handle=../x")).status).toBe(400);
    expect((await get("handle=test-electrolytes", false)).status).toBe(404);
  });
});
