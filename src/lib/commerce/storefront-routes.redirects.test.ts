import { HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";
import { server, shopify } from "./testing/msw";

// Through the proxy entry with Hydrogen's real redirect handling: only the
// Shopify route proxy is stubbed (no Shopify-owned path matched).
vi.mock("@/lib/flags", () => ({ isShopEnabled: () => true }));
vi.mock("./shopify/route-proxy.server", () => ({
  shopifyRouteResponse: async () => null,
}));
vi.mock("next/headers", () => ({
  headers: async () => new Headers(),
  cookies: async () => ({ get: () => undefined }),
}));

const { shopifyRoute } = await import("./storefront-routes.server");
const { findShopifyRedirect, findShopifyRedirectByPath } =
  await import("./shopify/redirects.server");

const get = (path: string) =>
  new Request(`https://local.test${path}`, {
    headers: { "x-real-ip": "203.0.113.7" },
  });

describe("redirects for unknown URLs through the proxy", () => {
  it("looks a path up once, and adds each visitor's own query", async () => {
    const asked: string[] = [];
    server.use(
      shopify.query("redirects", ({ variables }) => {
        asked.push(String(variables.query));
        return HttpResponse.json({
          data: {
            urlRedirects: {
              edges:
                variables.query === "path:/pages/old-faq"
                  ? [{ node: { target: "/pages/help" } }]
                  : [],
            },
          },
        });
      }),
    );
    const first = await shopifyRoute(get("/pages/old-faq?utm_source=a"));
    const second = await shopifyRoute(get("/Pages/Old-FAQ/?utm_source=b"));
    expect(first?.status).toBe(301);
    expect(first?.headers.get("location")).toBe(
      "https://local.test/pages/help?utm_source=a",
    );
    expect(second?.headers.get("location")).toBe(
      "https://local.test/pages/help?utm_source=b",
    );
    // A bot probing the same missing path repeatedly.
    for (let i = 0; i < 3; i++) {
      expect(await shopifyRoute(get(`/wp-login.php?x=${i}`))).toBeNull();
    }
    expect(asked).toEqual(["path:/pages/old-faq", "path:/wp-login.php"]);
  });

  it("remembers the same answer for every spelling of a path", async () => {
    server.use(
      shopify.query("redirects", () =>
        HttpResponse.json({ data: { urlRedirects: { edges: [] } } }),
      ),
    );
    // A visitor's odd spelling first must not decide what others get.
    const first = await shopifyRoute(
      get("/collections/test-apparel/products/Test-Tee/"),
    );
    const second = await shopifyRoute(
      get("/collections/test-apparel/products/test-tee"),
    );
    expect(first?.headers.get("location")).toBe(
      "https://local.test/products/test-tee",
    );
    expect(second?.headers.get("location")).toBe(
      "https://local.test/products/test-tee",
    );
  });

  it("asks again about a missing path after five minutes", async () => {
    const asked: string[] = [];
    server.use(
      shopify.query("redirects", ({ variables }) => {
        asked.push(String(variables.query));
        return HttpResponse.json({ data: { urlRedirects: { edges: [] } } });
      }),
    );
    const now = Date.now();
    const url = "https://local.test/pages/coming-soon";
    await findShopifyRedirectByPath(url, "203.0.113.7", now);
    await findShopifyRedirectByPath(url, "203.0.113.7", now + 4 * 60_000);
    await findShopifyRedirectByPath(url, "203.0.113.7", now + 6 * 60_000);
    expect(asked).toHaveLength(2);
  });

  it.each([
    "/.//example.com",
    "//example.com",
    "https://example.com",
    "/%2e//example.com",
    "/\\example.com",
    "/a/../\\example.com",
  ])("stay on the site for %s", async (target) => {
    server.use(
      shopify.query("redirects", () =>
        HttpResponse.json({ data: { urlRedirects: { edges: [] } } }),
      ),
    );
    for (const param of ["redirect", "return_to"]) {
      // No redirect at all: the 404 stands.
      expect(
        await shopifyRoute(get(`/nope?${param}=${encodeURIComponent(target)}`)),
        `${param}=${target}`,
      ).toBeNull();
    }
  });

  it("follows a same-site redirect param once, privately", async () => {
    const response = await shopifyRoute(get("/nope?redirect=/shop"));
    expect(response?.status).toBe(302);
    expect(response?.headers.get("cache-control")).toBe("private, no-store");
    expect(response?.headers.get("location")).toBe("https://local.test/shop");
  });

  it.each([
    "/account/login?return_to=/account/orders",
    "/account/refresh?return_to=/account",
    "/account/authorize?redirect=/shop",
  ])("never turns a failed account route into a redirect: %s", async (path) => {
    expect(await shopifyRoute(get(path))).toBeNull();
  });
});

describe("redirect lookups under load", () => {
  it("share one Shopify lookup between concurrent requests for a path", async () => {
    let asked = 0;
    server.use(
      shopify.query("redirects", async () => {
        asked++;
        await new Promise((resolve) => setTimeout(resolve, 20));
        return HttpResponse.json({ data: { urlRedirects: { edges: [] } } });
      }),
    );
    await Promise.all(
      Array.from({ length: 5 }, () => shopifyRoute(get("/pages/concurrent"))),
    );
    expect(asked).toBe(1);
  });

  it("remember a failed lookup only briefly, then find the redirect", async () => {
    const now = Date.now();
    vi.spyOn(console, "error").mockImplementation(() => {});
    server.use(shopify.query("redirects", () => HttpResponse.error()));
    const url = "https://local.test/pages/after-outage";
    expect(await findShopifyRedirectByPath(url, "203.0.113.7", now)).toBeNull();
    server.use(
      shopify.query("redirects", () =>
        HttpResponse.json({
          data: {
            urlRedirects: { edges: [{ node: { target: "/pages/back" } }] },
          },
        }),
      ),
    );
    // Still within the 30 seconds: not asked again.
    expect(
      await findShopifyRedirectByPath(url, "203.0.113.7", now + 10_000),
    ).toBeNull();
    // A miss would be kept five minutes; a failure isn't.
    expect(
      await findShopifyRedirectByPath(url, "203.0.113.7", now + 31_000),
    ).toBe("/pages/back");
  });

  it("count a throttled lookup as failed, not as no redirect", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    server.use(
      shopify.query("redirects", () =>
        HttpResponse.json({
          errors: [{ message: "Throttled", extensions: { code: "THROTTLED" } }],
        }),
      ),
    );
    await expect(
      findShopifyRedirect("https://local.test/pages/throttled", "203.0.113.7"),
    ).rejects.toThrow("redirect lookup failed");
  });

  it("give up on a lookup that takes over 2 seconds", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    server.use(
      shopify.query("redirects", async () => {
        await new Promise((resolve) => setTimeout(resolve, 2_500));
        return HttpResponse.json({ data: { urlRedirects: { edges: [] } } });
      }),
    );
    const started = Date.now();
    await expect(
      findShopifyRedirect("https://local.test/pages/slow", "203.0.113.7"),
    ).rejects.toThrow("redirect lookup failed");
    expect(Date.now() - started).toBeLessThan(2_400);
  });

  it("keep the target's own params and add the visitor's others", async () => {
    server.use(
      shopify.query("redirects", () =>
        HttpResponse.json({
          data: {
            urlRedirects: {
              edges: [
                {
                  node: { target: "/collections/sale?sort_by=price-ascending" },
                },
              ],
            },
          },
        }),
      ),
    );
    const response = await shopifyRoute(
      get("/pages/old-sale?sort_by=best-selling&utm_source=email"),
    );
    expect(response?.headers.get("location")).toBe(
      "https://local.test/collections/sale?sort_by=price-ascending&utm_source=email",
    );
  });

  it("look up a //host path on this site, not on that host", async () => {
    const asked: string[] = [];
    server.use(
      shopify.query("redirects", ({ variables }) => {
        asked.push(String(variables.query));
        return HttpResponse.json({ data: { urlRedirects: { edges: [] } } });
      }),
    );
    await findShopifyRedirectByPath(
      "https://local.test//evil.example/x",
      "203.0.113.7",
    );
    expect(asked).toEqual(["path://evil.example/x"]);
  });

  it("leave no timer behind once a lookup is answered", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      server.use(
        shopify.query("redirects", () =>
          HttpResponse.json({ data: { urlRedirects: { edges: [] } } }),
        ),
      );
      await findShopifyRedirect(
        "https://local.test/pages/quick",
        "203.0.113.7",
      );
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("limit how often one client can ask with ?redirect=", async () => {
    let asked = 0;
    server.use(
      shopify.query("redirects", () => {
        asked++;
        return HttpResponse.json({ data: { urlRedirects: { edges: [] } } });
      }),
    );
    const ip = { "x-real-ip": "198.51.100.77" };
    for (let i = 0; i < 25; i++) {
      await shopifyRoute(
        new Request(`https://local.test/nope-${i}?redirect=/shop`, {
          headers: ip,
        }),
      );
    }
    // The ?redirect= itself needs no Shopify call; requests past the limit
    // get no redirect at all.
    const over = await shopifyRoute(
      new Request("https://local.test/nope-x?redirect=/shop", { headers: ip }),
    );
    expect(over).toBeNull();
    expect(asked).toBeLessThanOrEqual(20);
  });
});
