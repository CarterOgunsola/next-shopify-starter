import { describe, expect, it, vi } from "vitest";

const flags = vi.hoisted(() => ({ on: true }));
vi.mock("@/lib/flags", () => ({ isShopEnabled: () => flags.on }));
const route = vi.hoisted(() =>
  vi.fn(
    async (): Promise<Response | null> =>
      new Response(null, { status: 302, headers: { Location: "/" } }),
  ),
);
vi.mock("./shopify/route-proxy.server", () => ({
  shopifyRouteResponse: route,
}));
const lookup = vi.hoisted(() =>
  vi.fn(async (): Promise<string | null> => null),
);
vi.mock("./shopify/redirects.server", () => ({
  findShopifyRedirect: lookup,
  findShopifyRedirectByPath: lookup,
}));

const { shopifyRoute } = await import("./storefront-routes.server");
const secure = (path: string, init?: RequestInit) =>
  new Request(`https://local.test${path}`, init);

describe("shopifyRoute", () => {
  it("hands Shopify paths to Hydrogen while the shop is on", async () => {
    expect(
      await shopifyRoute(secure("/api/2026-10/graphql.json")),
    ).not.toBeNull();
  });

  it("sends account routes on a plain-HTTP origin to the account page", async () => {
    const response = await shopifyRoute(
      new Request("http://localhost:4747/account/login"),
    );
    expect(response?.status).toBe(303);
    expect(response?.headers.get("location")).toBe(
      "http://localhost:4747/account?login=https",
    );
  });

  it("clears the cart cookie when the customer signs out", async () => {
    const response = await shopifyRoute(
      secure("/account/logout", { method: "POST" }),
    );
    expect(response?.status).toBe(302);
    expect(response?.headers.get("set-cookie")).toContain(
      "store_cart=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0",
    );
  });

  it("keeps the cart when sign-out is refused", async () => {
    route.mockResolvedValueOnce(new Response(null, { status: 403 }));
    const response = await shopifyRoute(
      secure("/account/logout", { method: "POST" }),
    );
    expect(response?.status).toBe(403);
    expect(response?.headers.get("set-cookie")).toBeNull();
  });

  it("logs a failed Storefront API call from Shopify's scripts", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    route.mockResolvedValueOnce(
      new Response("{}", {
        status: 502,
        headers: { "x-request-id": "synthetic-request-2" },
      }),
    );
    const response = await shopifyRoute(
      secure("/api/unstable/graphql.json", { method: "POST" }),
    );
    expect(response?.status).toBe(502);
    expect(warn).toHaveBeenCalledWith(
      "[shopify-routes] /api/unstable/graphql.json answered 502, request synthetic-request-2",
    );
    warn.mockRestore();
  });

  it("serves the agent endpoints uncached", async () => {
    route.mockResolvedValueOnce(
      new Response("{}", {
        headers: { "Cache-Control": "public, max-age=60" },
      }),
    );
    const response = await shopifyRoute(secure("/api/mcp", { method: "POST" }));
    expect(response?.headers.get("cache-control")).toBe("private, no-store");
  });

  it("lets Next handle the request when a Shopify route throws", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    route.mockRejectedValueOnce(new Error("shop id lookup failed"));
    expect(await shopifyRoute(secure("/api/2026-10/graphql.json"))).toBeNull();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("301s a URL no route matches when Shopify has a redirect for it", async () => {
    route.mockResolvedValueOnce(null);
    lookup.mockResolvedValueOnce("/products/new-handle");
    const response = await shopifyRoute(secure("/pages/old-faq"));
    expect(response?.status).toBe(301);
    expect(response?.headers.get("location")).toBe(
      "https://local.test/products/new-handle",
    );
  });

  it("leaves our own routes and unknown URLs without a redirect to Next", async () => {
    lookup.mockClear();
    route.mockResolvedValueOnce(null);
    expect(await shopifyRoute(secure("/products/test-tee"))).toBeNull();
    expect(lookup).not.toHaveBeenCalled();
    route.mockResolvedValueOnce(null);
    lookup.mockResolvedValueOnce(null);
    expect(await shopifyRoute(secure("/pages/nope"))).toBeNull();
  });

  it("does nothing while the shop is off", async () => {
    flags.on = false;
    expect(await shopifyRoute(secure("/api/2026-10/graphql.json"))).toBeNull();
    expect(await shopifyRoute(secure("/account/login"))).toBeNull();
    // Next then answers 404, like every other shop route.
    expect(
      await shopifyRoute(secure("/api/mcp", { method: "POST" })),
    ).toBeNull();
    expect(
      await shopifyRoute(secure("/api/ucp/mcp", { method: "POST" })),
    ).toBeNull();
    expect(await shopifyRoute(secure("/.well-known/ucp"))).toBeNull();
  });
});
