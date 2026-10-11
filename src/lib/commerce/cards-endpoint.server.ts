import "server-only";
import { isShopEnabled } from "@/lib/flags";
import { publicContext } from "./audience";
import { getProductCardsAtRequest } from "./catalog.server";
import { isTemporaryFailure } from "./errors";
import { isValidHandle } from "./handles";

// GET /api/commerce/cards?handles=a,b,c: current cards for products the
// browser remembers (recently viewed), so prices, stock and badges are
// fresh. Handles only; public consumer data, briefly shared-cached.
export async function handleCardsRequest(
  request: Request,
  { shopEnabled = isShopEnabled }: { shopEnabled?: () => boolean } = {},
): Promise<Response> {
  const json = (body: unknown, status = 200, cache = "no-store") =>
    Response.json(body, { status, headers: { "Cache-Control": cache } });
  if (!shopEnabled()) return json({ error: "not_found" }, 404);
  const handles = (new URL(request.url).searchParams.get("handles") ?? "")
    .split(",")
    .filter(Boolean);
  if (
    handles.length === 0 ||
    handles.length > 8 ||
    !handles.every(isValidHandle)
  ) {
    return json({ error: "bad_request" }, 400);
  }
  let products;
  try {
    products = await getProductCardsAtRequest(publicContext(), handles);
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
