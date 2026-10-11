import "server-only";
import { getBuyerIp } from "./buyer.server";
import { readCartId } from "./cart.server";
import { sessionTools } from "./customer-token.server";
import { linkCartToCustomer } from "./shopify/operations/cart";
import { fetchAccount } from "./shopify/operations/customer";
import { getShopId } from "./shopify/customer-session.server";
import type { AccountState } from "./types";

// Customer accounts: sign-in state and the account page's data. Pages only
// read the session; signing in, refreshing tokens and signing out happen in
// Hydrogen's /account/* handlers (src/proxy.ts), which can set the cookie.

export async function getAccountState(): Promise<AccountState> {
  const tools = await sessionTools();
  if (!tools) return { status: "unavailable" };
  const { customerSession, requestContext, manager } = tools;
  if (!(await customerSession.isLoggedIn(manager, requestContext))) {
    return { status: "signed-out" };
  }
  const token = await customerSession.getAccessToken(manager, requestContext);
  if (!token) return { status: "needs-refresh" };
  const shopId = await getShopId();
  const account = await fetchAccount(shopId, requestContext, token);
  return account
    ? {
        status: "signed-in",
        ...account,
        manageUrl: `https://shopify.com/${shopId}/account`,
      }
    : { status: "error" };
}

// Ties the visitor's cart to the customer who just signed in, so checkout
// knows who they are. Best effort: no cart or no token means nothing to do.
export async function linkCart(): Promise<void> {
  const tools = await sessionTools();
  const cartId = await readCartId();
  if (!tools || !cartId) return;
  const token = await tools.customerSession.getAccessToken(
    tools.manager,
    tools.requestContext,
  );
  if (!token) return;
  try {
    await linkCartToCustomer(cartId, token, await getBuyerIp());
  } catch (error) {
    console.warn(
      `[accounts] linking the cart to the customer failed: ${error instanceof Error ? error.name : typeof error}`,
    );
  }
}
