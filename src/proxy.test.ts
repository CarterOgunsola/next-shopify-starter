import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { proxy } from "./proxy";

const shopify = vi.hoisted(() => ({ route: vi.fn() }));
vi.mock("@/lib/commerce/storefront-routes.server", () => ({
  shopifyRoute: shopify.route,
}));

afterEach(() => {
  vi.unstubAllEnvs();
  shopify.route.mockReset();
});

const NOINDEX = { key: "X-Robots-Tag", value: "noindex, nofollow" };

describe("proxy", () => {
  it("sends the build's headers with what Shopify's routes answer", async () => {
    vi.stubEnv("RESPONSE_HEADERS", JSON.stringify([NOINDEX]));
    shopify.route.mockResolvedValue(Response.json({ name: "Synthetic" }));
    const response = await proxy(
      new NextRequest("https://site.example/.well-known/ucp"),
    );
    expect(await response.json()).toEqual({ name: "Synthetic" });
    expect(response.headers.get("x-robots-tag")).toBe(NOINDEX.value);
  });

  it("leaves what Next routes to next.config.ts headers()", async () => {
    vi.stubEnv("RESPONSE_HEADERS", JSON.stringify([NOINDEX]));
    shopify.route.mockResolvedValue(null);
    const response = await proxy(new NextRequest("https://site.example/"));
    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(response.headers.has("x-robots-tag")).toBe(false);
  });
});
