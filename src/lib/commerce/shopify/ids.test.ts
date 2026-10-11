import { describe, expect, it } from "vitest";
import { legacyId, parseGid, toGid } from "./ids";

describe("Shopify ids", () => {
  it("parses gids, including cart ids with a key", () => {
    expect(parseGid("gid://shopify/Product/123")).toEqual({
      type: "Product",
      id: "123",
    });
    expect(parseGid("gid://shopify/Cart/c1-abc?key=xyz")).toEqual({
      type: "Cart",
      id: "c1-abc",
    });
    expect(parseGid("123")).toBeNull();
  });

  it("round-trips and extracts the numeric id", () => {
    expect(toGid("ProductVariant", 42)).toBe("gid://shopify/ProductVariant/42");
    expect(legacyId(toGid("Product", "7"))).toBe("7");
  });
});
