import { describe, expect, it } from "vitest";
import { withSearchTracking } from "./search-tracking";

describe("withSearchTracking", () => {
  it("appends Shopify's search params", () => {
    expect(withSearchTracking("/products/tee", "_pos=1&_sid=abc&_ss=r")).toBe(
      "/products/tee?_pos=1&_sid=abc&_ss=r",
    );
    expect(withSearchTracking("/search?q=tee", "_sid=abc")).toBe(
      "/search?q=tee&_sid=abc",
    );
  });

  it("leaves links alone without them, or when they aren't a query string", () => {
    expect(withSearchTracking("/products/tee", null)).toBe("/products/tee");
    expect(withSearchTracking("/products/tee", "a=1#x")).toBe("/products/tee");
    expect(withSearchTracking("/products/tee", "//evil")).toBe("/products/tee");
  });
});
