import "server-only";
import { cookies, headers } from "next/headers";
import { redirect, unstable_rethrow } from "next/navigation";
import { customerAccountEnv, STORE_LOCALE } from "./config.server";
import {
  cookieSessionManager,
  getCustomerSession,
  getShopId,
  readonlySessionManager,
} from "./shopify/customer-session.server";
import type { CustomerCall } from "./shopify/operations/customer";
import { CUSTOMER_COOKIE } from "./shopify/session-cookie";
import { createShopifyRequestContext } from "./shopify/request-context";

// The signed-in customer's session for server code. Pages, the cart and
// checkout only read it (refreshing goes through /account/refresh, which
// can set the cookie); account actions can refresh in place.

export async function sessionTools() {
  const env = customerAccountEnv();
  const customerSession = env ? await getCustomerSession() : null;
  if (!env || !customerSession) return null;
  const incoming = await headers();
  const proto = incoming.get("x-forwarded-proto") ?? "https";
  const requestContext = createShopifyRequestContext(
    STORE_LOCALE,
    `${proto}://${incoming.get("host")}/account`,
  );
  const manager = await readonlySessionManager(env.sessionSecret);
  return { customerSession, requestContext, manager };
}

// signedIn: the visitor has a customer session. token: its access token,
// undefined when it has expired and needs /account/refresh. For the cart
// and checkout: a guest (no session cookie) never waits on the shop id
// lookup, and a session that can't be read (Shopify unreachable) counts as
// signed out, so adding to the cart still works.
export async function customerAccess(): Promise<{
  signedIn: boolean;
  token: string | undefined;
}> {
  const signedOut = { signedIn: false, token: undefined };
  if (!(await cookies()).has(CUSTOMER_COOKIE)) return signedOut;
  try {
    const tools = await sessionTools();
    if (!tools) return signedOut;
    const { customerSession, requestContext, manager } = tools;
    if (!(await customerSession.isLoggedIn(manager, requestContext))) {
      return signedOut;
    }
    return {
      signedIn: true,
      token: await customerSession.getAccessToken(manager, requestContext),
    };
  } catch (error) {
    unstable_rethrow(error);
    console.warn(
      `[customer] session unreadable, treated as signed out: ${error instanceof Error ? error.name : typeof error}`,
    );
    return signedOut;
  }
}

// --- The signed-in customer, for account pages and account actions.

export type CustomerCallState =
  | { status: "unavailable" }
  | { status: "signed-out" }
  | { status: "error" }
  | { status: "signed-in"; call: CustomerCall; shopId: string };

// For an account page (path is its own URL): the customer's API access, or
// why there is none. An expired token is refreshed through /account/refresh
// once (pages can't set cookies), coming back with ?refreshed=1; a refresh
// that didn't help shows the error state rather than "signed out".
export async function pageCustomer(
  path: string,
  refreshed: boolean,
): Promise<CustomerCallState> {
  const tools = await sessionTools();
  if (!tools) return { status: "unavailable" };
  const { customerSession, requestContext, manager } = tools;
  if (!(await customerSession.isLoggedIn(manager, requestContext))) {
    return { status: "signed-out" };
  }
  const token = await customerSession.getAccessToken(manager, requestContext);
  if (!token) {
    if (refreshed) {
      console.warn("[accounts] no access token after a refresh.");
      return { status: "error" };
    }
    const back = `${path}${path.includes("?") ? "&" : "?"}refreshed=1`;
    const linked = `/account/link-cart?return_to=${encodeURIComponent(back)}`;
    redirect(`/account/refresh?return_to=${encodeURIComponent(linked)}`);
  }
  const shopId = await getShopId();
  return {
    status: "signed-in",
    shopId,
    call: { shopId, requestContext, accessToken: token },
  };
}

// For an account server action: the customer's API access, refreshing an
// expired token in place (actions can set the session cookie). null when
// signed out or accounts are off.
export async function actionCustomer(): Promise<CustomerCall | null> {
  const env = customerAccountEnv();
  const customerSession = env ? await getCustomerSession() : null;
  if (!env || !customerSession) return null;
  const incoming = await headers();
  const proto = incoming.get("x-forwarded-proto") ?? "https";
  const origin = `${proto}://${incoming.get("host")}`;
  const requestContext = createShopifyRequestContext(
    STORE_LOCALE,
    `${origin}/account`,
  );
  const manager = await cookieSessionManager(env.sessionSecret, origin);
  if (!(await customerSession.isLoggedIn(manager, requestContext))) return null;
  const token = await customerSession.getOrRefreshAccessToken(
    manager,
    requestContext,
    { origin },
  );
  await manager.save();
  if (!token) return null;
  return { shopId: await getShopId(), requestContext, accessToken: token };
}
