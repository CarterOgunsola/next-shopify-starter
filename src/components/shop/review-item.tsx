import { REVIEW_INCENTIVE_DISCLOSURE } from "@/lib/commerce/compliance";
import { ComplianceNotice } from "./compliance-notice";
import type { Review } from "@/lib/reviews/types";

const date = (iso: string) =>
  iso
    ? new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(
        new Date(iso),
      )
    : "";

export function ReviewItem({
  review,
  focusable = false,
}: {
  review: Review;
  // Can take focus (after More reviews).
  focusable?: boolean;
}) {
  const id = `review-${review.id}`;
  return (
    <article aria-labelledby={id} tabIndex={focusable ? -1 : undefined}>
      <h3 id={id}>{review.title ?? `${review.rating} out of 5 stars`}</h3>
      <p>
        <span aria-hidden="true">
          {"★".repeat(review.rating) + "☆".repeat(5 - review.rating)}{" "}
        </span>
        {review.rating} out of 5 stars · {review.author}
        {review.createdAt && <> · {date(review.createdAt)}</>}
        {review.verifiedBuyer && <> · Verified buyer</>}
      </p>
      {review.incentivized && (
        <ComplianceNotice notice={REVIEW_INCENTIVE_DISCLOSURE} />
      )}
      {review.body.split(/\n+/).map((part, index) => (
        <p key={index}>{part}</p>
      ))}
    </article>
  );
}
