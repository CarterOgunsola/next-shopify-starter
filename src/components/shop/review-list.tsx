"use client";

import { useEffect, useRef, useState } from "react";
import type { Review, ReviewPage } from "@/lib/reviews/types";
import { ReviewItem } from "./review-item";

// The reviews, starting with the first page rendered on the server; More
// reviews loads the next page from /api/reviews, announces it and moves
// focus to the first new review.
export function ReviewList({
  handle,
  first,
}: {
  handle: string;
  first: ReviewPage;
}) {
  const [reviews, setReviews] = useState<Review[]>(first.reviews);
  const [page, setPage] = useState(first.page);
  const [hasMore, setHasMore] = useState(first.hasMore);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [announcement, setAnnouncement] = useState("");
  const list = useRef<HTMLOListElement>(null);
  const focusFrom = useRef<number | null>(null);

  useEffect(() => {
    if (focusFrom.current === null) return;
    list.current
      ?.querySelectorAll<HTMLElement>(":scope > li > article")
      [focusFrom.current]?.focus();
    focusFrom.current = null;
  });

  const more = async () => {
    setStatus("loading");
    try {
      const response = await fetch(
        `/api/reviews?${new URLSearchParams({ handle, page: String(page + 1) })}`,
      );
      if (!response.ok) throw new Error(String(response.status));
      const next = (await response.json()) as ReviewPage;
      const known = new Set(reviews.map((review) => review.id));
      const added = next.reviews.filter((review) => !known.has(review.id));
      focusFrom.current = added.length ? reviews.length : null;
      setReviews([...reviews, ...added]);
      setPage(next.page);
      setHasMore(next.hasMore && added.length > 0);
      setAnnouncement(
        `${added.length} more ${added.length === 1 ? "review" : "reviews"} shown.`,
      );
      setStatus("idle");
    } catch {
      setStatus("error");
    }
  };

  return (
    <>
      <ol aria-label="Reviews" ref={list}>
        {reviews.map((review) => (
          <li key={review.id}>
            <ReviewItem review={review} focusable />
          </li>
        ))}
      </ol>
      {hasMore && (
        <button
          type="button"
          onClick={more}
          aria-disabled={status === "loading" || undefined}
        >
          {status === "loading" ? "Loading…" : "More reviews"}
        </button>
      )}
      {status === "error" && (
        <p role="alert">More reviews couldn&apos;t load. Try again.</p>
      )}
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </>
  );
}
