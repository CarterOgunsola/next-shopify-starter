import type { ReviewSummary } from "@/lib/commerce";

// "4.7 out of 5 stars, 3 reviews": the stars are decoration, the words are
// the content.
export function RatingSummary({ summary }: { summary: ReviewSummary }) {
  const full = Math.round(summary.rating);
  return (
    <>
      <span aria-hidden="true">{"★".repeat(full) + "☆".repeat(5 - full)} </span>
      {summary.rating.toFixed(1)} out of 5 stars, {summary.count}{" "}
      {summary.count === 1 ? "review" : "reviews"}
    </>
  );
}
