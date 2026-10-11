import type { ReviewSummary } from "../../types";

// Shopify's standard review metafields: reviews.rating is a rating JSON
// ({ value, scale_min, scale_max }), reviews.rating_count an integer.
// Nothing to show without at least one review.
export function toReviewSummary(
  rating: { value: string } | null | undefined,
  count: { value: string } | null | undefined,
): ReviewSummary | null {
  const total = Number.parseInt(count?.value ?? "", 10);
  if (!Number.isInteger(total) || total < 1 || !rating) return null;
  try {
    const parsed = JSON.parse(rating.value) as {
      value?: unknown;
      scale_max?: unknown;
    };
    const value = Number(parsed.value);
    const max = Number(parsed.scale_max ?? 5);
    if (!Number.isFinite(value) || !Number.isFinite(max) || max <= 0) {
      return null;
    }
    // On a 5-point scale, to one decimal place.
    const outOfFive = Math.round((value / max) * 5 * 10) / 10;
    if (outOfFive < 0 || outOfFive > 5) return null;
    return { rating: outOfFive, count: total };
  } catch {
    return null;
  }
}
