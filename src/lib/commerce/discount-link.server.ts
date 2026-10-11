import "server-only";
import { isShopEnabled } from "@/lib/flags";
import { getBuyerContext } from "./buyer.server";
import { discountCodeSchema, safeRedirectPath } from "./discount-code";
import { applyDiscountCode } from "./discount.server";

// The ?redirect= path with the link's other params carried over (Collabs'
// dt_id, utm_*), so attribution sees them on the page the visitor lands on.
function landingPath(params: URLSearchParams): string {
  const target = new URL(
    safeRedirectPath(params.get("redirect")),
    "https://site.invalid",
  );
  for (const [key, value] of params) {
    if (key !== "redirect" && !target.searchParams.has(key)) {
      target.searchParams.append(key, value);
    }
  }
  return `${target.pathname}${target.search}${target.hash}`;
}

// Applies the code to the visitor's cart (creating one if needed) and
// redirects to the same-origin ?redirect= path, or the home page. The code
// stays on the cart even when it doesn't apply yet; the cart says why. If
// Shopify fails, the visitor still lands on the page, without the code.
export async function handleDiscountLink(
  request: Request,
  rawCode: string,
  { shopEnabled = isShopEnabled }: { shopEnabled?: () => boolean } = {},
): Promise<Response> {
  if (!shopEnabled()) return new Response("Not found", { status: 404 });

  const target = landingPath(new URL(request.url).searchParams);
  const code = discountCodeSchema.safeParse(rawCode);
  if (code.success) {
    try {
      await applyDiscountCode(code.data, await getBuyerContext());
    } catch (error) {
      // The error's class only: messages can echo request data.
      console.warn(
        `[discount-link] code not applied: ${error instanceof Error ? error.name : typeof error}`,
      );
    }
  }

  return new Response(null, {
    status: 302,
    headers: {
      Location: target,
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex",
    },
  });
}
