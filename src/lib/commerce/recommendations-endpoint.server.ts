import "server-only";
import { isShopEnabled } from "@/lib/flags";
import { publicContext } from "./audience";
import { getRecommendationsAtRequest } from "./catalog.server";
import { isTemporaryFailure } from "./errors";
import { isValidHandle } from "./handles";

// GET /api/commerce/recommendations?handle=…: what pairs well with a
// product (COMPLEMENTARY), for the cart drawer. Public consumer data,
// briefly shared-cached.
export async function handleRecommendationsRequest(
  request: Request,
  { shopEnabled = isShopEnabled }: { shopEnabled?: () => boolean } = {},
): Promise<Response> {
  const json = (body: unknown, status = 200, cache = "no-store") =>
    Response.json(body, { status, headers: { "Cache-Control": cache } });
  if (!shopEnabled()) return json({ error: "not_found" }, 404);
  const handle = new URL(request.url).searchParams.get("handle") ?? "";
  if (!isValidHandle(handle)) return json({ error: "bad_request" }, 400);
  let products;
  try {
    products = await getRecommendationsAtRequest(
      publicContext(),
      handle,
      "COMPLEMENTARY",
    );
  } catch (error) {
    if (!isTemporaryFailure(error)) throw error;
    return Response.json(
      { error: "unavailable" },
      {
        status: 503,
        headers: { "Cache-Control": "no-store", "Retry-After": "5" },
      },
    );
  }
  return json(
    { products },
    200,
    "public, max-age=0, s-maxage=300, stale-while-revalidate=600",
  );
}
