import { handleDiscountLink } from "@/lib/commerce/discount-link.server";

// /discount/{code}?redirect=/products/... : Shopify's discount link format,
// used by Collabs, emails and affiliates.
export async function GET(
  request: Request,
  { params }: RouteContext<"/discount/[code]">,
) {
  return handleDiscountLink(request, (await params).code);
}
