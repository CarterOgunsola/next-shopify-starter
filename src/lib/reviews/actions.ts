"use server";

import { headers } from "next/headers";
import { clientIp } from "@/lib/host/client-ip";
import { publicContext } from "@/lib/commerce/audience";
import { getProductAtRequest } from "@/lib/commerce/catalog.server";
import { isShopEnabled } from "@/lib/flags";
import { createRateLimiter } from "@/lib/rate-limit";
import { submitReviewForm } from "./submit.server";
import { reviewsProvider } from "./provider.server";
import type { ReviewFormState } from "./form";

const allow = createRateLimiter({ limit: 3, windowMs: 10 * 60 * 1000 });

export async function submitReview(
  _previous: ReviewFormState,
  form: FormData,
): Promise<ReviewFormState> {
  if (!isShopEnabled()) {
    return { status: "error", message: "Reviews aren't open yet." };
  }
  const ip = clientIp(await headers());
  if (!ip && process.env.NODE_ENV === "production") {
    return {
      status: "error",
      message: "Reviews can't be sent right now. Try again later.",
    };
  }
  return submitReviewForm(form, {
    allow,
    clientKey: ip ?? "local",
    provider: reviewsProvider(),
    productId: async (handle) =>
      (await getProductAtRequest(publicContext(), handle).catch(() => null))
        ?.content.id ?? null,
  });
}
