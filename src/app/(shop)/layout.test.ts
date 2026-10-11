import { afterEach, describe, expect, it, vi } from "vitest";

const flags = vi.hoisted(() => ({ indexed: false }));
vi.mock("@/lib/flags", () => ({
  isShopIndexed: () => flags.indexed,
  requireShop: () => {},
}));

const { generateMetadata } = await import("./layout");

afterEach(() => {
  flags.indexed = false;
});

describe("shop metadata", () => {
  it("is noindex, nofollow until launch", () => {
    expect(generateMetadata().robots).toEqual({ index: false, follow: false });
  });

  it("is indexable after launch", () => {
    flags.indexed = true;
    expect(generateMetadata().robots).toBeUndefined();
  });
});
