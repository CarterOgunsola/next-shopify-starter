import "server-only";
import { z } from "zod";
import { isShopEnabled } from "@/lib/flags";
import { publicContext } from "./audience";
import { getBuyerContext } from "./buyer.server";
import { isPublishedProduct } from "./catalog.server";
import { isTemporaryFailure } from "./errors";
import { isValidHandle } from "./handles";
import { getVariantView } from "./pricing.server";

// POST /api/commerce/variant: live variant state for the product page,
// which is static and can't read request data itself. Never cached.

const bodySchema = z.object({
  handle: z.string().refine(isValidHandle),
  selection: z
    .record(z.string().min(1).max(100), z.string().min(1).max(100))
    .refine((selection) => Object.keys(selection).length <= 10),
  // Numeric id from a Shopify ?variant= link.
  variantId: z
    .string()
    .regex(/^\d{1,20}$/)
    .nullish(),
});

const NO_STORE = { "Cache-Control": "private, no-store" };

const json = (body: unknown, status = 200, headers: HeadersInit = {}) =>
  Response.json(body, { status, headers: { ...NO_STORE, ...headers } });

export async function handleVariantRequest(
  request: Request,
  { shopEnabled = isShopEnabled }: { shopEnabled?: () => boolean } = {},
): Promise<Response> {
  if (!shopEnabled()) return json({ error: "not_found" }, 404);

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return json({ error: "bad_request" }, 400);

  const { handle, selection, variantId } = parsed.data;
  try {
    if (!(await isPublishedProduct(publicContext(), handle))) {
      return json({ error: "not_found" }, 404);
    }
    const view = await getVariantView(
      handle,
      selection,
      await getBuyerContext(),
      variantId ?? undefined,
    );
    return view ? json(view) : json({ error: "not_found" }, 404);
  } catch (error) {
    if (isTemporaryFailure(error)) {
      return json({ error: "unavailable" }, 503, { "Retry-After": "5" });
    }
    throw error;
  }
}
