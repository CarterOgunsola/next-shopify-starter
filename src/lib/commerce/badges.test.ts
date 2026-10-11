import { describe, expect, it } from "vitest";
import { lowStock, productBadges, type BadgeInput } from "./badges";

const NOW = Date.parse("2026-10-09T12:00:00Z");
const base: BadgeInput = {
  available: true,
  publishedAt: "2025-01-01T00:00:00Z",
  singlePrice: true,
  price: 20,
  compareAt: null,
  subscriptionAvailable: false,
  merchantLabels: [],
};
const labels = (input: Partial<BadgeInput>) =>
  productBadges({ ...base, ...input }, NOW).map((badge) => badge.label);

describe("productBadges", () => {
  it("shows none for a plain product", () => {
    expect(labels({})).toEqual([]);
  });

  it("claims a percentage only for one price against a higher compare-at", () => {
    expect(labels({ compareAt: 25 })).toEqual(["Save 20%"]);
    expect(labels({ compareAt: 25, singlePrice: false })).toEqual(["Sale"]);
    expect(labels({ compareAt: 20 })).toEqual([]);
    expect(labels({ compareAt: 15 })).toEqual([]);
  });

  it("says sold out rather than on sale when nothing can be bought", () => {
    expect(labels({ available: false, compareAt: 25 })).toEqual(["Sold out"]);
  });

  it("is new for 30 days after publishing, not before", () => {
    expect(labels({ publishedAt: "2026-10-01T00:00:00Z" })).toEqual(["New"]);
    expect(labels({ publishedAt: "2026-09-01T00:00:00Z" })).toEqual([]);
    expect(labels({ publishedAt: "2026-11-01T00:00:00Z" })).toEqual([]);
    expect(labels({ publishedAt: null })).toEqual([]);
  });

  it("notes a subscription option while the product can be bought", () => {
    expect(labels({ subscriptionAvailable: true })).toEqual([
      "Subscription available",
    ]);
    expect(labels({ subscriptionAvailable: true, available: false })).toEqual([
      "Sold out",
    ]);
  });

  it("adds up to two merchant badges, tidied and without repeats", () => {
    expect(
      labels({
        merchantLabels: [
          "  Best   seller ",
          "Best seller",
          "",
          null,
          "x".repeat(31),
          "Staff pick",
          "Third",
        ],
      }),
    ).toEqual(["Best seller", "Staff pick"]);
  });
});

describe("lowStock", () => {
  const variant = { availableForSale: true, currentlyNotInStock: false };

  it("reports units left at or below five for a tracked variant", () => {
    expect(lowStock({ ...variant, quantityAvailable: 1 })).toBe(1);
    expect(lowStock({ ...variant, quantityAvailable: 5 })).toBe(5);
    expect(lowStock({ ...variant, quantityAvailable: 6 })).toBeUndefined();
  });

  it("stays quiet for untracked, backordered, sold-out or unreadable stock", () => {
    expect(lowStock({ ...variant, quantityAvailable: 0 })).toBeUndefined();
    expect(
      lowStock({
        availableForSale: true,
        currentlyNotInStock: true,
        quantityAvailable: 2,
      }),
    ).toBeUndefined();
    expect(
      lowStock({ ...variant, availableForSale: false, quantityAvailable: 2 }),
    ).toBeUndefined();
    expect(lowStock({ ...variant, quantityAvailable: null })).toBeUndefined();
  });
});
