import { NextResponse, type NextRequest } from "next/server";
import { wantsMarkdown } from "@/lib/commerce/agent-text.server";
import { shopifyRoute } from "@/lib/commerce/storefront-routes.server";
import { isShopIndexed } from "@/lib/flags";
import { COUNTRY_COOKIE } from "@/lib/consent/region";

export async function proxy(request: NextRequest) {
  // Shopify-owned paths (Storefront API proxy for analytics and consent,
  // /checkout, cart permalinks) never reach Next routing, nor do URLs no
  // route matches that Shopify has a redirect for.
  const shopify = await shopifyRoute(request);
  if (shopify) return shopify;

  // Agents asking for Markdown get the page as text (same URL).
  const markdown = markdownPath(request);
  if (markdown) {
    return NextResponse.rewrite(new URL(markdown, request.url));
  }

  const response = NextResponse.next();
  if (!request.nextUrl.pathname.startsWith("/api/"))
    setCountry(request, response);
  return response;
}

function markdownPath(request: NextRequest): string | null {
  if (!isShopIndexed() || !wantsMarkdown(request.headers.get("accept"))) {
    return null;
  }
  const match = /^\/(products|collections|policies)\/([^/]+)$/.exec(
    request.nextUrl.pathname,
  );
  return match ? `/md/${match[1]}/${match[2]}` : null;
}

// Copies Vercel's geo header into a cookie the consent layer can read, so
// pages stay static. Locally there is no header and the cookie is skipped;
// the consent layer then falls back to the opt-in model.
function setCountry(request: NextRequest, response: NextResponse) {
  const country = request.headers.get("x-vercel-ip-country");
  if (country && request.cookies.get(COUNTRY_COOKIE)?.value !== country) {
    response.cookies.set(COUNTRY_COOKIE, country, {
      path: "/",
      sameSite: "lax",
      secure: true,
      maxAge: 60 * 60 * 24,
    });
  }
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)",
  ],
};
