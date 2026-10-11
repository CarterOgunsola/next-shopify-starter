import "server-only";
import { serverEnv } from "@/lib/env";
import { judgeme } from "./judgeme.server";
import { noReviews, type ReviewsProvider } from "./types";

// The review app in use: Judge.me when its token is set, otherwise none
// (ratings still show from Shopify's standard review metafields).
// New reviews are taken (a review app is configured).
export const reviewsOpen = () => reviewsProvider() !== noReviews;

export function reviewsProvider(): ReviewsProvider {
  const token = serverEnv().JUDGEME_PRIVATE_TOKEN;
  const shopDomain = process.env.SHOPIFY_STORE_DOMAIN?.trim();
  return token && shopDomain ? judgeme({ token, shopDomain }) : noReviews;
}
