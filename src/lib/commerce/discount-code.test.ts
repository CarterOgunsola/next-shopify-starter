import { describe, expect, it } from "vitest";
import { discountCodeSchema, safeRedirectPath } from "./discount-code";

describe("safeRedirectPath", () => {
  it.each([
    ["/products/test-tee-3-option", "/products/test-tee-3-option"],
    ["/collections/all?sort=price#top", "/collections/all?sort=price#top"],
    [null, "/"],
    ["", "/"],
    ["https://evil.test/x", "/"],
    ["//evil.test/x", "/"],
    ["/\\evil.test", "/"],
    ["javascript:alert(1)", "/"],
    ["products/no-leading-slash", "/"],
    ["/.//evil.test", "/"],
    ["/x/..//evil.test", "/"],
    ["/%2e//evil.test", "/"],
    ["/a/../\\evil.test", "/"],
    ["/\t/evil.test", "/"],
    ["/a/./b/../c", "/a/c"],
  ])("%s -> %s", (input, expected) => {
    expect(safeRedirectPath(input)).toBe(expected);
  });
});

describe("discountCodeSchema", () => {
  it("trims and rejects spaces or empty codes", () => {
    expect(discountCodeSchema.parse(" TEST10 ")).toBe("TEST10");
    expect(discountCodeSchema.safeParse("TWO WORDS").success).toBe(false);
    expect(discountCodeSchema.safeParse("   ").success).toBe(false);
  });
});
