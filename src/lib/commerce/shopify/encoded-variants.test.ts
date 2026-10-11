import { describe, expect, it } from "vitest";
import { decodeEncodedVariants } from "./encoded-variants";

describe("decodeEncodedVariants", () => {
  it("decodes Shopify's documented example", () => {
    // Options [Size, Color, Material], from the Product.encodedVariantExistence docs.
    expect(
      decodeEncodedVariants("v1_0:0:0,1:0-1,,1:0:0-1,1:1,,2:0:1,1:0,,"),
    ).toEqual([
      [0, 0, 0],
      [0, 1, 0],
      [0, 1, 1],
      [1, 0, 0],
      [1, 0, 1],
      [1, 1, 1],
      [2, 0, 1],
      [2, 1, 0],
    ]);
  });

  it("decodes single-option ranges and gaps", () => {
    expect(decodeEncodedVariants("v1_0-2")).toEqual([[0], [1], [2]]);
    expect(decodeEncodedVariants("v1_0 2-3")).toEqual([[0], [2], [3]]);
    expect(decodeEncodedVariants("v1_0")).toEqual([[0]]);
  });

  it("returns nothing for empty or unknown encodings", () => {
    expect(decodeEncodedVariants("")).toEqual([]);
    expect(decodeEncodedVariants(null)).toEqual([]);
    expect(decodeEncodedVariants("v2_0:0")).toEqual([]);
  });
});
