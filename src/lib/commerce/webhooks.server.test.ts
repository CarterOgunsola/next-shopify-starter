import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createSeenIds,
  handleShopifyWebhook,
  tagsForWebhook,
  verifyHmac,
} from "./webhooks.server";

const SECRET = "synthetic-webhook-secret";
const SHOP = "synthetic-store.myshopify.com";

function sign(body: string, secret = SECRET) {
  return createHmac("sha256", secret).update(body, "utf8").digest("base64");
}

function webhook(
  topic: string,
  payload: unknown,
  headers: Record<string, string> = {},
) {
  const body = typeof payload === "string" ? payload : JSON.stringify(payload);
  return new Request("http://localhost/api/webhooks/shopify", {
    method: "POST",
    body,
    headers: {
      "x-shopify-topic": topic,
      "x-shopify-hmac-sha256": sign(body),
      "x-shopify-shop-domain": SHOP,
      "x-shopify-webhook-id": crypto.randomUUID(),
      ...headers,
    },
  });
}

function deps(overrides = {}) {
  const expire = vi.fn();
  return {
    expire,
    deps: {
      shopEnabled: () => true,
      secret: () => SECRET,
      storeDomain: () => SHOP,
      expire,
      seen: createSeenIds(),
      ...overrides,
    },
  };
}

afterEach(() => vi.restoreAllMocks());

describe("verifyHmac", () => {
  it("accepts Shopify's signature and rejects anything else", () => {
    const body = '{"id":1}';
    expect(verifyHmac(body, sign(body), SECRET)).toBe(true);
    expect(verifyHmac(body, sign(body, "other"), SECRET)).toBe(false);
    expect(verifyHmac(`${body} `, sign(body), SECRET)).toBe(false);
    expect(verifyHmac(body, null, SECRET)).toBe(false);
    expect(verifyHmac(body, "short", SECRET)).toBe(false);
  });
});

describe("tagsForWebhook", () => {
  it("maps shop updates to the shop tag (policies, shop id)", () => {
    expect(tagsForWebhook("shop/update", { id: 1 })).toEqual(["shop"]);
  });

  it("maps product changes to the product's tags and the index", () => {
    expect(
      tagsForWebhook("products/update", {
        id: 8838427967694,
        handle: "test-tee-3-option",
      }),
    ).toEqual([
      "product-id-8838427967694",
      "product-test-tee-3-option",
      "products-index",
    ]);
  });

  it("handles deletes, which only carry the id", () => {
    expect(tagsForWebhook("products/delete", { id: 42 })).toEqual([
      "product-id-42",
      "products-index",
    ]);
    expect(tagsForWebhook("collections/delete", { id: 7 })).toEqual([
      "collection-id-7",
      "collections-index",
    ]);
  });

  it("maps collections and metaobjects", () => {
    expect(
      tagsForWebhook("collections/update", { id: 7, handle: "test-all" }),
    ).toEqual(["collection-id-7", "collection-test-all", "collections-index"]);
    expect(
      tagsForWebhook("metaobjects/update", { type: "size_chart" }),
    ).toEqual(["metaobject-size_chart"]);
  });

  it("ignores unknown topics and malformed payloads", () => {
    expect(tagsForWebhook("orders/create", { id: 1 })).toEqual([]);
    expect(tagsForWebhook("products/update", { nope: true })).toEqual([]);
  });
});

describe("handleShopifyWebhook", () => {
  it("expires the tags for a signed product update", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    const { expire, deps: d } = deps();
    const response = await handleShopifyWebhook(
      webhook("products/update", { id: 1, handle: "test-tee-3-option" }),
      d,
    );
    expect(response.status).toBe(200);
    expect(expire.mock.calls.map(([tag]) => tag)).toEqual([
      "product-id-1",
      "product-test-tee-3-option",
      "products-index",
    ]);
  });

  it("answers 401 to a bad signature, the wrong store or no secret", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const bad = deps();
    expect(
      (
        await handleShopifyWebhook(
          webhook(
            "products/update",
            { id: 1 },
            { "x-shopify-hmac-sha256": sign("x") },
          ),
          bad.deps,
        )
      ).status,
    ).toBe(401);
    expect(
      (
        await handleShopifyWebhook(
          webhook(
            "products/update",
            { id: 1 },
            { "x-shopify-shop-domain": "other.myshopify.com" },
          ),
          bad.deps,
        )
      ).status,
    ).toBe(401);
    expect(
      (
        await handleShopifyWebhook(
          webhook("products/update", { id: 1 }),
          deps({ secret: () => null }).deps,
        )
      ).status,
    ).toBe(401);
    expect(bad.expire).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalled();
  });

  it("404s while the shop is off, without reading the secret or store env", async () => {
    const storeDomain = vi.fn(() => SHOP);
    const secret = vi.fn(() => SECRET);
    const { expire, deps: d } = deps({
      shopEnabled: () => false,
      secret,
      storeDomain,
    });
    const response = await handleShopifyWebhook(
      webhook("products/update", { id: 1 }),
      d,
    );
    expect(response.status).toBe(404);
    expect(secret).not.toHaveBeenCalled();
    expect(storeDomain).not.toHaveBeenCalled();
    expect(expire).not.toHaveBeenCalled();
  });

  it("reads the store domain only after the signature checks out", async () => {
    const storeDomain = vi.fn(() => {
      throw new Error("store env missing");
    });
    const { deps: d } = deps({ storeDomain });
    const forged = await handleShopifyWebhook(
      webhook(
        "products/update",
        { id: 1 },
        {
          "x-shopify-hmac-sha256": sign("{}"),
        },
      ),
      d,
    );
    expect(forged.status).toBe(401);
    expect(storeDomain).not.toHaveBeenCalled();
  });

  it("handles a repeated delivery once", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    const { expire, deps: d } = deps();
    const headers = { "x-shopify-webhook-id": "repeat-1" };
    await handleShopifyWebhook(
      webhook("products/update", { id: 1 }, headers),
      d,
    );
    const again = await handleShopifyWebhook(
      webhook("products/update", { id: 1 }, headers),
      d,
    );
    expect(again.status).toBe(200);
    expect(expire).toHaveBeenCalledTimes(2);
  });

  it("rejects a body that isn't JSON without recording it as handled", async () => {
    const seen = { has: vi.fn(() => false), add: vi.fn() };
    const { deps: d } = deps({ seen });
    expect(
      (await handleShopifyWebhook(webhook("products/update", "not json"), d))
        .status,
    ).toBe(400);
    expect(seen.has).not.toHaveBeenCalled();
    expect(seen.add).not.toHaveBeenCalled();
  });

  it("records a delivery as handled only after its tags expire", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    const seen = createSeenIds();
    const headers = { "x-shopify-webhook-id": "retry-1" };
    const failing = deps({
      seen,
      expire: () => {
        throw new Error("cache unavailable");
      },
    });
    await expect(
      handleShopifyWebhook(
        webhook("products/update", { id: 1 }, headers),
        failing.deps,
      ),
    ).rejects.toThrow("cache unavailable");
    expect(seen.has("retry-1")).toBe(false);

    const { expire, deps: d } = deps({ seen });
    await handleShopifyWebhook(
      webhook("products/update", { id: 1 }, headers),
      d,
    );
    expect(expire).toHaveBeenCalled();
    expect(seen.has("retry-1")).toBe(true);
  });

  it("never logs the payload", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const { deps: d } = deps();
    await handleShopifyWebhook(
      webhook("products/update", { id: 1, title: "synthetic-secret-title" }),
      d,
    );
    expect(JSON.stringify(info.mock.calls)).not.toContain(
      "synthetic-secret-title",
    );
  });
});

describe("createSeenIds", () => {
  it("forgets ids after the window", () => {
    let time = 0;
    const seen = createSeenIds({ ttlMs: 1000, now: () => time });
    expect(seen.has("a")).toBe(false);
    seen.add("a");
    expect(seen.has("a")).toBe(true);
    time = 2000;
    expect(seen.has("a")).toBe(false);
  });
});
