import "server-only";
import {
  createShopifyRequestContext,
  createStorefrontClient,
  handleShopifyRoutes,
} from "@shopify/hydrogen";
import {
  analyticsEnv,
  API_VERSION,
  commerceEnv,
  customerAccountEnv,
  STORE_LOCALE,
} from "../config.server";
import {
  customerAccountHandlers,
  recordTokenRequests,
  settleRefresh,
  writableSessionManager,
} from "./customer-session.server";
import { forwardableRequest } from "../forwarded-request";
import { routeTemplates } from "./route-templates";
import { clientIp } from "@/lib/client-ip";
import { requestOrigin } from "../request-origin";

// Hydrogen's Shopify routes, run from src/proxy.ts before Next routing:
// chiefly the same-origin Storefront API proxy (/api/<version>/graphql.json)
// that Shopify analytics and consent need for their session cookies, plus
// Shopify's own paths such as /checkout and cart permalinks. Everything else
// passes through. A private client, as Shopify's Next.js template does: the
// proxy adds the visitor's IP and our storefront id to what it forwards, so
// consent, analytics and agent traffic reach Shopify per buyer rather than
// from the host's IPs. The browser's own requests carry the public token;
// the private token is never forwarded.
//
// Customer accounts (when configured) add Hydrogen's sign-in handlers, on
// the encrypted session cookie. Hydrogen's cart handlers aren't registered:
// our own cart layer owns the cart.
const SIGN_IN_PATHS = new Set(["/account/login", "/account/authorize"]);

export async function shopifyRouteResponse(
  request: Request,
): Promise<Response | null> {
  // The public token isn't needed here: the Storefront API proxy forwards
  // the token the browser sends (Shopify's scripts only load when it's
  // set), and everything else runs on the private token.
  const { storefrontId } = analyticsEnv();
  const { storeDomain, privateToken } = commerceEnv();
  // Locally there may be no client IP header (Shopify's template uses
  // loopback too). In production, refuse rather than proxy from our IPs.
  const buyerIp =
    clientIp(request.headers) ??
    (process.env.NODE_ENV !== "production" ? "127.0.0.1" : undefined);
  if (!buyerIp) {
    console.error("[shopify-routes] no trusted client IP header; not proxied.");
    return null;
  }
  // What Hydrogen sees and forwards to Shopify: never our own cookies. The
  // session manager below reads the original request.
  const outgoing = await forwardableRequest(request);
  const requestContext = createShopifyRequestContext({
    request: outgoing,
    i18n: STORE_LOCALE,
    buyerIp,
  });
  const storefrontClient = createStorefrontClient({
    type: "private",
    requestContext,
    config: {
      storeDomain,
      privateStorefrontToken: privateToken,
      ...(storefrontId !== "0" ? { storefrontId } : {}),
      apiVersion: API_VERSION,
    },
  });
  const accounts = customerAccountEnv();
  const origin = requestOrigin(request);
  const sessionManager = accounts
    ? writableSessionManager(request, accounts.sessionSecret)
    : {
        getSessionOrigin: () => origin,
        getSessionItem: () => undefined,
        setSessionItem: () => {},
        removeSessionItem: () => {},
      };
  // Hydrogen's account handlers (which need the shop id) only for
  // Hydrogen's account paths, so other requests never wait on that lookup.
  // Without the shop id (Shopify unreachable), they aren't registered for
  // this request; the rest of the proxy keeps working.
  const accountPath = new URL(request.url).pathname.startsWith("/account/");
  const handlers =
    accounts && accountPath
      ? await customerAccountHandlers().catch((error: unknown) => {
          console.warn(
            `[shopify-routes] account routes unavailable: ${error instanceof Error ? error.name : typeof error}`,
          );
          return null;
        })
      : null;
  // Signing in can't start without the shop id: say so on the account page
  // rather than letting Next answer 404.
  if (
    accounts &&
    !handlers &&
    SIGN_IN_PATHS.has(new URL(request.url).pathname)
  ) {
    return new Response(null, {
      status: 303,
      headers: {
        Location: new URL("/account?login=unavailable", request.url).href,
        "Cache-Control": "private, no-store",
      },
    });
  }
  const { result: response, outcome } = await recordTokenRequests(() =>
    handleShopifyRoutes({
      request: outgoing,
      requestContext,
      storefrontClient,
      sessionManager,
      // Shopify's standard URL shapes this site doesn't have (collection-
      // scoped product URLs) redirect here with a 301, before Next routing.
      routeTemplates,
      ...(handlers ? { handlers: [handlers] } : {}),
    }),
  );
  if (
    response &&
    accounts &&
    handlers &&
    new URL(request.url).pathname === "/account/refresh"
  ) {
    return settleRefresh(response, outcome, accounts.sessionSecret);
  }
  return response ?? null;
}
