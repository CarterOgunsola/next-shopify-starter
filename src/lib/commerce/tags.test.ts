import { describe, expect, it } from "vitest";
import { tags } from "./tags";

describe("cache tags", () => {
  it("spell short handles as they are", () => {
    expect(tags.product("test-tee-3-option")).toBe("product-test-tee-3-option");
  });

  it("stay within Next's 256 characters for the longest handles", () => {
    const longest = "a".repeat(255);
    const tag = tags.product(longest);
    expect(tag.length).toBeLessThanOrEqual(256);
    expect(tag).toBe(tags.product(longest));
    expect(tag).not.toBe(tags.product(`${"a".repeat(254)}b`));
    expect(tags.collection(longest).startsWith("collection-h-")).toBe(true);
  });
});
