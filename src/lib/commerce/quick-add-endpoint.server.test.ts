import { HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";
import electrolytes from "./testing/fixtures/ProductContent.test-electrolytes.json";
import { published, replay, server, shopify } from "./testing/msw";
import { handleQuickAddRequest } from "./quick-add-endpoint.server";
import type { QuickAddProduct } from "./types";

vi.mock("next/cache", () => ({ cacheLife: () => {}, cacheTag: () => {} }));

const get = (query: string, on = true) =>
  handleQuickAddRequest(
    new Request(`https://local.test/api/commerce/quick-add?${query}`),
    { shopEnabled: () => on },
  );

describe("GET /api/commerce/quick-add", () => {
  it("gives a product's options, plans and default variant, briefly shared-cached", async () => {
    server.use(
      ...published({ products: ["test-electrolytes"] }),
      replay("ProductContent", electrolytes),
    );
    const response = await get("handle=test-electrolytes");
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe(
      "public, max-age=0, s-maxage=300, stale-while-revalidate=600",
    );
    const { product }: { product: QuickAddProduct } = await response.json();
    expect(product.handle).toBe("test-electrolytes");
    expect(product.options.map((option) => option.name)).toEqual([
      "Flavor",
      "Size",
    ]);
    expect(product.sellingPlanGroups.length).toBeGreaterThan(0);
    expect(product.requiresSellingPlan).toBe(false);
    // Its price, but no stock claims: those come from the live answer.
    expect(product.initialView?.variant?.price.amount).toBe("24.0");
    expect(product.initialView?.variant).not.toHaveProperty("available");
    expect(product.initialView?.variant).not.toHaveProperty("lowStock");
    expect(product.image?.url).toMatch(/^https:\/\/cdn\.shopify\.com\//);
  });

  it("404s a product that isn't published, without reading it", async () => {
    let read = false;
    server.use(
      ...published({ products: [] }),
      shopify.query("ProductContent", () => {
        read = true;
        return HttpResponse.json(electrolytes);
      }),
    );
    expect((await get("handle=test-electrolytes")).status).toBe(404);
    expect(read).toBe(false);
  });

  it("refuses a bad handle and 404s while the shop is off", async () => {
    expect((await get("handle=../x")).status).toBe(400);
    expect((await get("handle=test-electrolytes", false)).status).toBe(404);
  });
});
