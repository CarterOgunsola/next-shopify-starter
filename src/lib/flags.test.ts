import { afterEach, describe, expect, it, vi } from "vitest";

const env = vi.hoisted(() => ({
  SITE_INDEXED: false,
  SHOP_ENABLED: false,
  SHOP_INDEXED: false,
}));
vi.mock("@/lib/env", () => ({ serverEnv: () => env }));

const { isShopIndexed, isSiteIndexed } = await import("./flags");

afterEach(() => {
  Object.assign(env, {
    SITE_INDEXED: false,
    SHOP_ENABLED: false,
    SHOP_INDEXED: false,
  });
});

describe("indexing flags", () => {
  it("keeps the site out of search until SITE_INDEXED is on", () => {
    expect(isSiteIndexed()).toBe(false);
    env.SITE_INDEXED = true;
    expect(isSiteIndexed()).toBe(true);
  });

  it("never indexes the shop while the site isn't indexed", () => {
    Object.assign(env, { SHOP_ENABLED: true, SHOP_INDEXED: true });
    expect(isShopIndexed()).toBe(false);
  });

  it("indexes the shop once the site is indexed, the shop is on and SHOP_INDEXED is on", () => {
    Object.assign(env, { SITE_INDEXED: true, SHOP_INDEXED: true });
    expect(isShopIndexed()).toBe(false);
    env.SHOP_ENABLED = true;
    expect(isShopIndexed()).toBe(true);
    env.SHOP_INDEXED = false;
    expect(isShopIndexed()).toBe(false);
  });
});
