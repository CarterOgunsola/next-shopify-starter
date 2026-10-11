import "server-only";
import type { Review, ReviewsProvider } from "./types";

// Judge.me's REST API (https://judge.me/api/v1), server side only, with the
// private token: review lists need it, and responses include reviewers'
// emails and IPs, which are dropped here and never leave this module.

const BASE = "https://judge.me/api/v1";
const TIMEOUT_MS = 5_000;
export const REVIEWS_PER_PAGE = 5;

type JudgemeReview = {
  id: number | string;
  rating: number;
  title?: string | null;
  body?: string | null;
  reviewer?: { name?: string | null } | null;
  created_at?: string;
  published?: boolean;
  hidden?: boolean;
  // Judge.me's moderation: "ok" once approved.
  curated?: string | null;
  verified?: string | null;
  // The reviewer got something for the review (a discount, a gift).
  incentivized?: boolean;
};

// "Avery Example" as "Avery E.": a first name and an initial. A name that
// looks like an email address shows as Anonymous.
export function displayName(name: string | null | undefined): string {
  if (name?.includes("@")) return "Anonymous";
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "Anonymous";
  const [first, ...rest] = parts;
  const initial = rest.at(-1)?.[0];
  return initial ? `${first} ${initial.toUpperCase()}.` : first;
}

const plainText = (html: string | null | undefined) =>
  (html ?? "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();

// Only a review the merchant approved is shown: published, not hidden,
// and curated "ok" in Judge.me's moderation.
export function toReview(review: JudgemeReview): Review | null {
  if (
    review.published !== true ||
    review.hidden === true ||
    review.curated !== "ok"
  ) {
    return null;
  }
  const rating = Math.round(Number(review.rating));
  const body = plainText(review.body);
  if (!(rating >= 1 && rating <= 5) || !body) return null;
  return {
    id: String(review.id),
    rating,
    title: plainText(review.title) || null,
    body,
    author: displayName(review.reviewer?.name),
    createdAt: review.created_at ?? "",
    verifiedBuyer: review.verified === "buyer",
    incentivized: review.incentivized === true,
  };
}

export function judgeme({
  token,
  shopDomain,
  // Looked up at call time, so test interception (and any later patch of
  // fetch) applies.
  fetch: request = (input, init) => fetch(input, init),
}: {
  token: string;
  shopDomain: string;
  fetch?: typeof fetch;
}): ReviewsProvider {
  const url = (path: string, params: Record<string, string> = {}) => {
    const out = new URL(`${BASE}${path}`);
    out.search = new URLSearchParams({
      api_token: token,
      shop_domain: shopDomain,
      ...params,
    }).toString();
    return out;
  };
  const get = async <T>(path: string, params: Record<string, string>) => {
    const response = await request(url(path, params), {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { accept: "application/json" },
    });
    if (!response.ok) throw new Error(`Judge.me answered ${response.status}`);
    return (await response.json()) as T;
  };

  return {
    async list(productId, page) {
      // Judge.me lists by its own product id.
      const { product } = await get<{ product?: { id?: number | string } }>(
        "/products/-1",
        { external_id: productId },
      );
      if (!product?.id) return { reviews: [], page, hasMore: false };
      const data = await get<{ reviews?: JudgemeReview[] }>("/reviews", {
        product_id: String(product.id),
        per_page: String(REVIEWS_PER_PAGE),
        page: String(page),
      });
      const raw = data.reviews ?? [];
      const reviews = raw.flatMap((r) => toReview(r) ?? []);
      return { reviews, page, hasMore: raw.length === REVIEWS_PER_PAGE };
    },

    async submit(input) {
      try {
        const response = await request(url("/reviews"), {
          method: "POST",
          signal: AbortSignal.timeout(TIMEOUT_MS),
          headers: {
            "content-type": "application/json",
            accept: "application/json",
          },
          body: JSON.stringify({
            shop_domain: shopDomain,
            platform: "shopify",
            id: input.productId,
            name: input.name,
            email: input.email,
            rating: input.rating,
            title: input.title,
            body: input.body,
          }),
        });
        return response.ok ? { ok: true } : { ok: false, reason: "failed" };
      } catch {
        return { ok: false, reason: "failed" };
      }
    },
  };
}
