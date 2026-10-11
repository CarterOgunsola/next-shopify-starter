import type { ReviewSummary } from "@/lib/commerce";
import type { ReviewPage } from "@/lib/reviews/types";
import { RatingSummary } from "./rating-summary";
import { ReviewList } from "./review-list";
import { ReviewForm } from "./review-form";

// The product's reviews: the rating, the first page (rendered with the
// page), more on request, and the form when the review app takes reviews.
export function ProductReviews({
  handle,
  summary,
  page,
  open,
}: {
  handle: string;
  summary: ReviewSummary | null;
  page: ReviewPage;
  // A review app is configured, so new reviews are taken.
  open: boolean;
}) {
  if (!summary && page.reviews.length === 0 && !open) return null;
  return (
    <section aria-labelledby="reviews">
      <h2 id="reviews">Reviews</h2>
      <p>{summary ? <RatingSummary summary={summary} /> : "No reviews yet."}</p>
      {page.reviews.length > 0 && <ReviewList handle={handle} first={page} />}
      {open && <ReviewForm handle={handle} />}
    </section>
  );
}
