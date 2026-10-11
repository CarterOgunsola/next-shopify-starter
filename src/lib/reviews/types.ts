// Product reviews, independent of the review app that supplies them.

export type Review = {
  id: string;
  // 1 to 5.
  rating: number;
  title: string | null;
  // Plain text.
  body: string;
  // Display name only, never the reviewer's email or full surname.
  author: string;
  createdAt: string;
  verifiedBuyer: boolean;
  // The reviewer got something for it: the review says so.
  incentivized: boolean;
};

export type ReviewPage = { reviews: Review[]; page: number; hasMore: boolean };

export type ReviewInput = {
  // Shopify's numeric product id.
  productId: string;
  name: string;
  email: string;
  rating: number;
  title: string;
  body: string;
};

export type SubmitResult =
  { ok: true } | { ok: false; reason: "unavailable" | "failed" };

export interface ReviewsProvider {
  // Published reviews of a product, newest first, a page at a time.
  list(productId: string, page: number): Promise<ReviewPage>;
  // A new review, which the app holds for moderation before publishing.
  submit(input: ReviewInput): Promise<SubmitResult>;
}

// No review app configured: no reviews, and new ones aren't taken.
export const noReviews: ReviewsProvider = {
  list: async (_productId, page) => ({ reviews: [], page, hasMore: false }),
  submit: async () => ({ ok: false, reason: "unavailable" }),
};
