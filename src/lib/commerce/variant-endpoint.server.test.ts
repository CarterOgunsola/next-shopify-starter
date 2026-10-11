import { HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ice from "./testing/fixtures/VariantView.the-complete-snowboard.ice.json";
import { published, server, shopify } from "./testing/msw";
import { handleVariantRequest } from "./variant-endpoint.server";

const incoming = vi.hoisted(() => ({ ip: "203.0.113.7" as string | null }));
vi.mock("next/headers", () => ({
  headers: async () =>
    new Headers(incoming.ip ? { "x-real-ip": incoming.ip } : {}),
}));

vi.mock("next/cache", () => ({ cacheLife: () => {}, cacheTag: () => {} }));

const on = { shopEnabled: () => true };

beforeEach(() => {
  incoming.ip = "203.0.113.7";
  server.use(
    ...published({
      products: ["the-complete-snowboard", "the-out-of-stock-snowboard"],
    }),
  );
});

const post = (body: unknown) =>
  new Request("http://localhost/api/commerce/variant", {
    method: "POST",
    body: JSON.stringify(body),
  });

describe("handleVariantRequest", () => {
  it("returns the live view, uncached, for the visitor's IP", async () => {
    let request:
      { variables: Record<string, unknown>; ip: string | null } | undefined;
    server.use(
      shopify.query("VariantView", ({ variables, request: r }) => {
        request = {
          variables,
          ip: r.headers.get("Shopify-Storefront-Buyer-IP"),
        };
        return HttpResponse.json(ice);
      }),
    );

    const response = await handleVariantRequest(
      post({ handle: "the-complete-snowboard", selection: { color: "ice" } }),
      on,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect((await response.json()).variant.title).toBe("Ice");
    expect(request).toEqual({
      variables: expect.objectContaining({
        handle: "the-complete-snowboard",
        selectedOptions: [{ name: "color", value: "ice" }],
      }),
      ip: "203.0.113.7",
    });
  });

  it("accepts a numeric variant id from a Shopify link", async () => {
    server.use(
      shopify.query("VariantOptions", () =>
        HttpResponse.json({ data: { node: null } }),
      ),
      shopify.query("VariantView", () => HttpResponse.json(ice)),
    );
    const response = await handleVariantRequest(
      post({
        handle: "the-complete-snowboard",
        selection: {},
        variantId: "123",
      }),
      on,
    );
    expect(response.status).toBe(200);
    const bad = await handleVariantRequest(
      post({
        handle: "the-complete-snowboard",
        selection: {},
        variantId: "gid://x",
      }),
      on,
    );
    expect(bad.status).toBe(400);
  });

  it("404s when the shop is off, without calling Shopify", async () => {
    const response = await handleVariantRequest(
      post({ handle: "the-complete-snowboard", selection: {} }),
      { shopEnabled: () => false },
    );
    expect(response.status).toBe(404);
  });

  it.each([
    ["a malformed handle", { handle: "../x", selection: {} }],
    [
      "too many options",
      {
        handle: "x",
        selection: Object.fromEntries(
          Array.from({ length: 11 }, (_, i) => [`o${i}`, "v"]),
        ),
      },
    ],
    ["a missing body", null],
  ])("rejects %s", async (_, body) => {
    expect((await handleVariantRequest(post(body), on)).status).toBe(400);
  });

  it("404s for an unpublished product without asking for its variants", async () => {
    let asked = 0;
    server.use(
      shopify.query("VariantView", () => {
        asked++;
        return HttpResponse.json({ data: { product: null } });
      }),
    );
    const response = await handleVariantRequest(
      post({ handle: "no-such-product", selection: {} }),
      on,
    );
    expect(response.status).toBe(404);
    expect(asked).toBe(0);
  });

  it("answers 503 with Retry-After when Shopify is throttling", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    server.use(
      shopify.query("VariantView", () =>
        HttpResponse.json({
          data: null,
          errors: [{ message: "Throttled", extensions: { code: "THROTTLED" } }],
        }),
      ),
    );
    const response = await handleVariantRequest(
      post({ handle: "the-complete-snowboard", selection: {} }),
      on,
    );
    expect(response.status).toBe(503);
    expect(response.headers.get("Retry-After")).toBe("5");
  });

  it("answers 503 in production when the host sends no client IP", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.spyOn(console, "warn").mockImplementation(() => {});
    incoming.ip = null;
    const response = await handleVariantRequest(
      post({ handle: "the-complete-snowboard", selection: {} }),
      on,
    );
    expect(response.status).toBe(503);
    expect(response.headers.get("retry-after")).toBe("5");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });
});
