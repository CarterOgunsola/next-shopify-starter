import { BADGE_TEXT } from "./compliance";
import type { Badge } from "./types";

// Product badges, built from Shopify data when the product is read: a sale
// against the merchant's compare-at price, sold out, new, subscription
// available, and the merchant's own badges (a product metafield). Stock
// levels ("Only N left") aren't badges: cards are cached, so they come
// from the product page's live variant state (lowStock below).

// "New" for this many days after the product is published.
export const NEW_FOR_DAYS = 30;
// "Only N left" at or below this many units.
export const LOW_STOCK_AT = 5;
// Merchant badges shown, at most, and their longest label.
const MERCHANT_MAX = 2;
const LABEL_MAX = 30;

const DAY = 24 * 60 * 60 * 1000;

export type BadgeInput = {
  available: boolean;
  publishedAt: string | null;
  // One price for every variant, and the compare-at it's sold against.
  singlePrice: boolean;
  price: number;
  compareAt: number | null;
  // Sold on a plan as well as one time.
  subscriptionAvailable: boolean;
  merchantLabels: (string | null | undefined)[];
};

export function productBadges(input: BadgeInput, now: number): Badge[] {
  const badges: Badge[] = [];
  if (!input.available) {
    badges.push({ kind: "soldOut", label: BADGE_TEXT.soldOut });
  } else if (input.compareAt !== null && input.compareAt > input.price) {
    // A percentage only for one price: across a range it would be true
    // of some variants and not others.
    const percent = Math.round((1 - input.price / input.compareAt) * 100);
    badges.push({
      kind: "sale",
      label:
        input.singlePrice && percent >= 1
          ? BADGE_TEXT.save(percent)
          : BADGE_TEXT.sale,
    });
  }
  const published = input.publishedAt ? Date.parse(input.publishedAt) : NaN;
  if (published <= now && now - published < NEW_FOR_DAYS * DAY) {
    badges.push({ kind: "new", label: BADGE_TEXT.new });
  }
  if (input.subscriptionAvailable && input.available) {
    badges.push({ kind: "subscription", label: BADGE_TEXT.subscription });
  }
  const merchant = new Set(
    input.merchantLabels
      .map((label) => label?.replace(/\s+/g, " ").trim() ?? "")
      .filter((label) => label.length > 0 && label.length <= LABEL_MAX),
  );
  for (const label of [...merchant].slice(0, MERCHANT_MAX)) {
    badges.push({ kind: "merchant", label });
  }
  return badges;
}

// Units left for "Only N left": only for a tracked, in-stock variant at or
// below LOW_STOCK_AT. Untracked and backordered variants report 0.
export function lowStock(variant: {
  availableForSale: boolean;
  quantityAvailable?: number | null;
  currentlyNotInStock?: boolean;
}): number | undefined {
  const left = variant.quantityAvailable;
  if (!variant.availableForSale || variant.currentlyNotInStock) return;
  if (left == null || left <= 0 || left > LOW_STOCK_AT) return;
  return left;
}

// "New" ends with time, not with a catalog change: a cache holding a New
// badge is refreshed daily (cacheLife("days")) rather than kept until
// Shopify reports a change, so the badge comes off within a day.
export function hasNewBadge(
  items: ({ badges?: Badge[] } | null | undefined)[],
): boolean {
  return items.some((item) => item?.badges?.some((b) => b.kind === "new"));
}
