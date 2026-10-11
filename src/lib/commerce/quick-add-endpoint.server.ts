import "server-only";
import { isShopEnabled } from "@/lib/flags";
import {
  backInStockEnabled,
  backInStockMarketing,
} from "@/lib/marketing/back-in-stock";
import { publicContext } from "./audience";
import { getProductAtRequest } from "./catalog.server";
import { isTemporaryFailure } from "./errors";
import { isValidHandle } from "./handles";
import type { QuickAddProduct } from "./types";
import { firstPaintView } from "./variant-selection";

// GET /api/commerce/quick-add?handle=…: what a listing's quick add dialog
// needs for one product (options, plans, the cached default variant).
// Fetched when the visitor shows intent (hover, focus or tap), and briefly
// shared-cached: consumer data only. Live price and stock come from the
// variant endpoint, as on the product page.
export async function handleQuickAddRequest(
  request: Request,
  { shopEnabled = isShopEnabled }: { shopEnabled?: () => boolean } = {},
): Promise<Response> {
  const json = (body: unknown, status = 200, cache = "no-store") =>
    Response.json(body, { status, headers: { "Cache-Control": cache } });
  if (!shopEnabled()) return json({ error: "not_found" }, 404);
  const handle = new URL(request.url).searchParams.get("handle") ?? "";
  if (!isValidHandle(handle)) return json({ error: "bad_request" }, 400);
  try {
    const read = await getProductAtRequest(publicContext(), handle);
    if (!read) return json({ error: "not_found" }, 404);
    const { content, defaultView } = read;
    const image = content.media.find((media) => media.kind === "image");
    const product: QuickAddProduct = {
      handle: content.handle,
      title: content.title,
      image: image?.kind === "image" ? image.image : null,
      options: content.options,
      sellingPlanGroups: content.sellingPlanGroups,
      requiresSellingPlan: content.requiresSellingPlan,
      isGiftCard: content.isGiftCard,
      prop65: content.prop65,
      initialView: firstPaintView(defaultView),
      backInStock: backInStockEnabled(),
      marketingOptIn: backInStockMarketing(),
    };
    return json(
      { product },
      200,
      "public, max-age=0, s-maxage=300, stale-while-revalidate=600",
    );
  } catch (error) {
    if (isTemporaryFailure(error)) {
      return Response.json(
        { error: "unavailable" },
        {
          status: 503,
          headers: { "Cache-Control": "no-store", "Retry-After": "5" },
        },
      );
    }
    throw error;
  }
}
