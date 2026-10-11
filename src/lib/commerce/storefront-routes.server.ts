import "server-only";
import { isShopEnabled } from "@/lib/flags";
import { CLEAR_CART_COOKIE } from "./cart.server";
import { clientIp } from "@/lib/host/client-ip";
import { createRateLimiter } from "@/lib/rate-limit";
import { isAppRoute } from "./app-routes";
import { requestOrigin } from "./request-origin";
import {
  findShopifyRedirect,
  findShopifyRedirectByPath,
} from "./shopify/redirects.server";
import { shopifyRouteResponse } from "./shopify/route-proxy.server";

// Shopify's agent endpoints (Storefront MCP and UCP): agents can search
// the catalog and build carts. Consumer context only: they go to Shopify's
// public endpoints with none of our cookies, so no customer session or
// buyer pricing. Never cached.
const AGENT_PATHS = new Set(["/api/mcp", "/api/ucp/mcp"]);

// Shopify's Storefront API, proxied for its browser scripts.
const STOREFRONT_API = /^\/api\/(unstable|\d{4}-\d{2})\/graphql\.json$/;

const ACCOUNT_PATHS = new Set([
  "/account/login",
  "/account/authorize",
  "/account/refresh",
  "/account/logout",
]);

// For src/proxy.ts: a response for Shopify-owned paths (the Storefront API
// proxy, /checkout, cart permalinks, /account/login and friends), or null to
// let Next route the request.
export async function shopifyRoute(request: Request): Promise<Response | null> {
  if (!isShopEnabled()) return null;
  const { pathname } = new URL(request.url);
  // Shopify only signs customers in over HTTPS. On a plain-HTTP origin
  // (local dev without pnpm dev:https) the account page explains instead.
  if (
    ACCOUNT_PATHS.has(pathname) &&
    requestOrigin(request).startsWith("http:")
  ) {
    return new Response(null, {
      status: 303,
      headers: {
        Location: new URL("/account?login=https", request.url).href,
        "Cache-Control": "no-store",
      },
    });
  }
  const response = await shopifyRouteResponse(request).catch(
    (error: unknown) => {
      // Never fail every request because a Shopify route did: Next takes it.
      console.warn(
        `[shopify-routes] ${pathname} fell through: ${error instanceof Error ? error.name : typeof error}`,
      );
      return null;
    },
  );
  // Signing out also drops the cart cookie, so a shared device doesn't keep
  // the cart of the customer who just left. Only when sign-out went through.
  const redirected =
    response !== null && response.status >= 300 && response.status < 400;
  if (
    redirected &&
    pathname === "/account/logout" &&
    request.method === "POST"
  ) {
    const headers = new Headers(response.headers);
    headers.append("Set-Cookie", CLEAR_CART_COOKIE);
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  }
  if (!response) return shopifyRedirectFor(request, pathname);
  // Shopify's browser scripts (consent, analytics) only report a failed
  // call in the browser, opaquely: say which proxied call failed and how.
  if (STOREFRONT_API.test(pathname) && response.status >= 400) {
    const id = response.headers.get("x-request-id");
    console.warn(
      `[shopify-routes] ${pathname} answered ${response.status}${id ? `, request ${id}` : ""}`,
    );
  }
  if (AGENT_PATHS.has(pathname)) {
    const headers = new Headers(response.headers);
    headers.set("Cache-Control", "private, no-store");
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  }
  return response;
}

// A URL no route on this site matches: Shopify's redirect for it (an old
// Liquid URL, an admin URL redirect, a collection-scoped product URL, a
// ?redirect=), as a 301, before Next answers 404. Done here because Next
// renders not-found pages within every route, and static routes can't hold
// request-time work.
const allowParamLookup = createRateLimiter({ limit: 20, windowMs: 60_000 });

async function shopifyRedirectFor(
  request: Request,
  pathname: string,
): Promise<Response | null> {
  if (request.method !== "GET" && request.method !== "HEAD") return null;
  // Account routes never get here as a redirect: if their handlers failed,
  // a cached redirect from ?return_to= would skip sign-in.
  if (ACCOUNT_PATHS.has(pathname) || pathname.startsWith("/account/")) {
    return null;
  }
  if (isAppRoute(pathname)) return null;
  // A ?redirect= or ?return_to= is the visitor's own, one-off: a private
  // 302, looked up each time. Shopify's URL redirects and standard routes
  // are permanent, and looked up by path.
  const params = new URL(request.url).searchParams;
  const temporary = params.has("redirect") || params.has("return_to");
  const ip = clientIp(request.headers);
  // Those are looked up each time, so a client can only ask so often.
  if (temporary && !allowParamLookup(ip ?? "unknown")) return null;
  const lookup = temporary ? findShopifyRedirect : findShopifyRedirectByPath;
  const location = await lookup(request.url, ip).catch(() => null);
  if (!location) return null;
  return new Response(null, {
    status: temporary ? 302 : 301,
    // The proxy needs an absolute URL.
    headers: {
      Location: new URL(location, request.url).href,
      "Cache-Control": temporary ? "private, no-store" : "public, max-age=3600",
    },
  });
}
