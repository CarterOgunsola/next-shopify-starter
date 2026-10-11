import { describe, expect, it } from "vitest";
import { toReviewSummary } from "./reviews";

const rating = (value: string, max = "5.0") => ({
  value: JSON.stringify({ value, scale_min: "1.0", scale_max: max }),
});

describe("toReviewSummary", () => {
  it("reads Shopify's standard review metafields", () => {
    expect(toReviewSummary(rating("4.7"), { value: "3" })).toEqual({
      rating: 4.7,
      count: 3,
    });
  });

  it("puts another scale on five points", () => {
    expect(toReviewSummary(rating("8.6", "10.0"), { value: "12" })).toEqual({
      rating: 4.3,
      count: 12,
    });
  });

  it.each([
    [rating("4.7"), { value: "0" }],
    [rating("4.7"), null],
    [null, { value: "3" }],
    [{ value: "not json" }, { value: "3" }],
    [rating("7"), { value: "3" }],
  ])("is null without a usable rating and at least one review", (r, c) => {
    expect(toReviewSummary(r, c)).toBeNull();
  });
});
