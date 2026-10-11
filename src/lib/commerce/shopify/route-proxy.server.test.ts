import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { API_VERSION } from "../config.server";
import { server, shopify, TEST_STORE_DOMAIN } from "../testing/msw";
import { shopifyRouteResponse } from "./route-proxy.server";

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined }),
}));

beforeEach(() => {
  vi.stubEnv(
    "NEXT_PUBLIC_SHOPIFY_PUBLIC_ACCESS_TOKEN",
    "synthetic-public-token",
  );
  vi.stubEnv("SHOPIFY_STOREFRONT_ID", "1000099999");
});
afterEach(() => vi.unstubAllEnvs());

const browserQuery = (headers: Record<string, string>) =>
  new Request(`https://local.test/api/${API_VERSION}/graphql.json`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-shopify-storefront-access-token": "synthetic-public-token",
      ...headers,
    },
    body: JSON.stringify({ query: "query ShopName { shop { name } }" }),
  });

describe("the Storefront API proxy", () => {
  it("forwards per buyer, with our storefront id and never our cookies", async () => {
    let sent: Headers | undefined;
    server.use(
      shopify.query("ShopName", ({ request }) => {
        sent = request.headers;
        return HttpResponse.json({ data: { shop: { name: "Synthetic" } } });
      }),
    );
    const response = await shopifyRouteResponse(
      browserQuery({
        "x-real-ip": "203.0.113.7",
        cookie:
          "_shopify_essential=abc; store_cart=gid://shopify/Cart/x?key=k; _vercel_jwt=preview",
        authorization: "Bearer synthetic",
      }),
    );
    expect(response?.status).toBe(200);
    expect(sent?.get("shopify-storefront-buyer-ip")).toBe("203.0.113.7");
    expect(sent?.get("shopify-storefront-id")).toBe("1000099999");
    expect(sent?.get("cookie")).toBe("_shopify_essential=abc");
    expect(sent?.has("authorization")).toBe(false);
    // The browser's public token, never the private one.
    expect(sent?.get("x-shopify-storefront-access-token")).toBe(
      "synthetic-public-token",
    );
    expect(sent?.has("shopify-storefront-private-token")).toBe(false);
  });

  it("sends Hydrogen's own SDK headers, whatever the browser sends", async () => {
    // So there's no point forwarding the browser's: Hydrogen sets them on
    // every proxied request.
    let sent: Headers | undefined;
    server.use(
      shopify.query("ShopName", ({ request }) => {
        sent = request.headers;
        return HttpResponse.json({ data: { shop: { name: "Synthetic" } } });
      }),
    );
    await shopifyRouteResponse(
      browserQuery({
        "x-real-ip": "203.0.113.7",
        "x-sdk-variant": "browser-kit",
        "x-sdk-version": "2020-01",
      }),
    );
    expect(sent?.get("x-sdk-variant")).toBe("hydrogen");
    expect(sent?.get("x-sdk-version")).toBe(API_VERSION);
  });

  it("serves Shopify's UCP business profile at /.well-known/ucp, publicly cached", async () => {
    let sent: Headers | undefined;
    server.use(
      http.get(
        `https://${TEST_STORE_DOMAIN}/.well-known/ucp`,
        ({ request }) => {
          sent = request.headers;
          return HttpResponse.json({ name: "Synthetic", services: [] });
        },
      ),
    );
    const response = await shopifyRouteResponse(
      new Request("https://local.test/.well-known/ucp", {
        headers: {
          "x-real-ip": "203.0.113.7",
          cookie: "_shopify_y=y; store_cart=gid://shopify/Cart/x?key=k",
        },
      }),
    );
    expect(response?.status).toBe(200);
    expect(await response?.json()).toEqual({ name: "Synthetic", services: [] });
    expect(response?.headers.get("cache-control")).toContain(
      "public, max-age=60",
    );
    // A public document: no visitor cookies go to Shopify for it.
    expect(sent?.has("cookie")).toBe(false);
  });

  it("adds no token to a browser request that sends none", async () => {
    // Hydrogen's proxy forwards the browser's token and never supplies
    // ours: an unauthenticated request stays unauthenticated.
    let sent: Headers | undefined;
    server.use(
      shopify.query("ShopName", ({ request }) => {
        sent = request.headers;
        return HttpResponse.json({ data: { shop: { name: "Synthetic" } } });
      }),
    );
    const request = browserQuery({ "x-real-ip": "203.0.113.7" });
    request.headers.delete("x-shopify-storefront-access-token");
    await shopifyRouteResponse(request);
    expect(sent).toBeDefined();
    expect(sent?.has("x-shopify-storefront-access-token")).toBe(false);
    expect(sent?.has("shopify-storefront-private-token")).toBe(false);
  });

  it.each(["/cart/checkout", "/cart", "/cart/checkout?refreshed=1"])(
    "leaves our own %s to Next, while cart permalinks go to Shopify",
    async (path) => {
      const ours = await shopifyRouteResponse(
        new Request(`https://local.test${path}`, {
          headers: { "x-real-ip": "203.0.113.7" },
        }),
      );
      expect(ours).toBeNull();
      const permalink = await shopifyRouteResponse(
        new Request("https://local.test/cart/48430964211918:1", {
          headers: { "x-real-ip": "203.0.113.7" },
        }),
      );
      expect(permalink?.status).toBeGreaterThanOrEqual(300);
      expect(permalink?.status).toBeLessThan(400);
      expect(new URL(permalink!.headers.get("location")!).pathname).toBe(
        "/cart/48430964211918:1",
      );
    },
  );

  it("turns a Shopify ?variant= link into option params on the server", async () => {
    server.use(
      shopify.query("VariantSelectedOptions", () =>
        HttpResponse.json({
          data: {
            node: {
              selectedOptions: [
                { name: "Color", value: "Black" },
                { name: "Size", value: "XL" },
              ],
              product: { handle: "test-tee-3-option" },
            },
          },
        }),
      ),
    );
    const response = await shopifyRouteResponse(
      new Request(
        "https://local.test/products/test-tee-3-option?variant=48430964211918&utm_source=x",
        { headers: { "x-real-ip": "203.0.113.7" } },
      ),
    );
    expect(response?.status).toBe(302);
    const location = new URL(response!.headers.get("location")!);
    expect(location.pathname).toBe("/products/test-tee-3-option");
    expect(location.searchParams.get("Color")).toBe("Black");
    expect(location.searchParams.get("Size")).toBe("XL");
    expect(location.searchParams.get("utm_source")).toBe("x");
    expect(location.searchParams.has("variant")).toBe(false);
  });

  it("keeps Shopify's routes working without the public token", async () => {
    vi.stubEnv("NEXT_PUBLIC_SHOPIFY_PUBLIC_ACCESS_TOKEN", "");
    server.use(
      shopify.query("VariantSelectedOptions", () =>
        HttpResponse.json({
          data: {
            node: {
              selectedOptions: [{ name: "Size", value: "S" }],
              product: { handle: "test-tee-3-option" },
            },
          },
        }),
      ),
    );
    const response = await shopifyRouteResponse(
      new Request(
        "https://local.test/products/test-tee-3-option?variant=48430964211918",
        { headers: { "x-real-ip": "203.0.113.7" } },
      ),
    );
    expect(response?.status).toBe(302);
  });

  it("sends sign-in to the account page when the shop id can't be read", async () => {
    vi.stubEnv("SHOPIFY_CUSTOMER_CLIENT_ID", "synthetic-client-id");
    vi.stubEnv(
      "CUSTOMER_ACCOUNT_SESSION_SECRET",
      "synthetic-session-secret-0123456789abcdef",
    );
    vi.spyOn(console, "warn").mockImplementation(() => {});
    server.use(shopify.query("ShopId", () => HttpResponse.error()));
    const response = await shopifyRouteResponse(
      new Request("https://local.test/account/login", {
        headers: { "x-real-ip": "203.0.113.7" },
      }),
    );
    expect(response?.status).toBe(303);
    expect(response?.headers.get("location")).toBe(
      "https://local.test/account?login=unavailable",
    );
    expect(response?.headers.get("cache-control")).toBe("private, no-store");
  });

  it("doesn't look up the shop id for requests that aren't account routes", async () => {
    vi.stubEnv("SHOPIFY_CUSTOMER_CLIENT_ID", "synthetic-client-id");
    vi.stubEnv(
      "CUSTOMER_ACCOUNT_SESSION_SECRET",
      "synthetic-session-secret-0123456789abcdef",
    );
    let lookups = 0;
    server.use(
      shopify.query("ShopId", () => {
        lookups++;
        return HttpResponse.json({
          data: { shop: { id: "gid://shopify/Shop/7" } },
        });
      }),
    );
    await shopifyRouteResponse(
      new Request("https://local.test/products/test-tee", {
        headers: { "x-real-ip": "203.0.113.7" },
      }),
    );
    expect(lookups).toBe(0);
  });

  it("isn't proxied in production without a client IP", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await shopifyRouteResponse(browserQuery({}))).toBeNull();
  });
});
