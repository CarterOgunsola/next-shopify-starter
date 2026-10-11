import "server-only";
import { publicContext } from "@/lib/commerce/audience";
import { getProductAtRequest } from "@/lib/commerce/catalog.server";
import { isValidHandle } from "@/lib/commerce/handles";
import { isShopEnabled } from "@/lib/flags";
import { loadReviewPage } from "./reviews.server";

const MAX_PAGE = 50;

// GET /api/reviews?handle=…&page=N: later pages of a product's reviews for
// the product page's "More reviews". The first page is in the page itself.
export async function handleReviewsRequest(
  request: Request,
  { shopEnabled = isShopEnabled }: { shopEnabled?: () => boolean } = {},
): Promise<Response> {
  const json = (body: unknown, status = 200, cache = "no-store") =>
    Response.json(body, { status, headers: { "Cache-Control": cache } });
  if (!shopEnabled()) return json({ error: "not_found" }, 404);
  const params = new URL(request.url).searchParams;
  const handle = params.get("handle") ?? "";
  const page = Number(params.get("page") ?? "");
  if (
    !isValidHandle(handle) ||
    !Number.isInteger(page) ||
    page < 1 ||
    page > MAX_PAGE
  ) {
    return json({ error: "bad_request" }, 400);
  }
  const product = await getProductAtRequest(publicContext(), handle).catch(
    () => null,
  );
  if (!product) return json({ error: "not_found" }, 404);
  const result = await loadReviewPage(handle, product.content.id, page);
  // Public reviews only, shared-cached briefly.
  return json(
    result,
    200,
    "public, max-age=0, s-maxage=300, stale-while-revalidate=600",
  );
}
