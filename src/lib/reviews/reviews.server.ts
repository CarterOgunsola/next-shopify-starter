import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { tags } from "@/lib/commerce/tags";
import { reviewsProvider } from "./provider.server";
import type { ReviewPage } from "./types";

// "gid://shopify/Product/123" as "123", the id review apps use.
export const productNumber = (gid: string) => /\/(\d+)$/.exec(gid)?.[1] ?? null;

// A page of a product's published reviews, cached for an hour per product
// and page (tag reviews-<handle>), since review apps send no webhook here.
async function cachedReviewPage(
  handle: string,
  productId: string,
  page: number,
): Promise<ReviewPage> {
  "use cache";
  cacheLife("hours");
  cacheTag(tags.reviews(handle));
  return reviewsProvider().list(productId, page);
}

// The same, empty if the review app can't be reached (not cached then).
export async function loadReviewPage(
  handle: string,
  productGid: string,
  page = 1,
): Promise<ReviewPage> {
  const productId = productNumber(productGid);
  if (!productId) return { reviews: [], page, hasMore: false };
  try {
    return await cachedReviewPage(handle, productId, page);
  } catch (error) {
    console.warn(
      `[reviews] list unavailable: ${error instanceof Error ? error.name : typeof error}`,
    );
    return { reviews: [], page, hasMore: false };
  }
}
