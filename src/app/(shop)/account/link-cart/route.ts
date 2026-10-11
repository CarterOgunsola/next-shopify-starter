import { safeRedirectPath } from "@/lib/commerce/discount-code";
import { linkCart } from "@/lib/commerce/customer.server";
import { isShopEnabled } from "@/lib/flags";

// The first stop after signing in: ties the visitor's cart to the customer,
// then continues to return_to (same-origin paths only).
export async function GET(request: Request) {
  if (!isShopEnabled()) return new Response("Not found", { status: 404 });
  await linkCart();
  const target = safeRedirectPath(
    new URL(request.url).searchParams.get("return_to"),
  );
  return new Response(null, {
    status: 302,
    headers: { Location: target, "Cache-Control": "private, no-store" },
  });
}
