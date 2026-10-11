import "server-only";
import { type CustomerCallState, pageCustomer } from "./customer-token.server";
import {
  fetchAddresses,
  fetchOrder,
  fetchOrders,
  fetchProfile,
  describeCustomerError,
  type CustomerCall,
} from "./shopify/operations/customer";
import type {
  CustomerAddress,
  CustomerProfile,
  OrderDetail,
  OrderSummary,
  Page,
} from "./types";

// Data for the account pages, per request and never cached: each read is
// the signed-in customer's own, through the Customer Account API.

export type AccountPage<T> =
  | Exclude<CustomerCallState, { status: "signed-in" }>
  | {
      status: "signed-in";
      data: T;
      // Shopify's hosted account: subscriptions, returns, payment methods
      // and apps' pages.
      manageUrl: string;
    };

async function load<T>(
  path: string,
  refreshed: boolean,
  read: (call: CustomerCall) => Promise<T>,
): Promise<AccountPage<T>> {
  const state = await pageCustomer(path, refreshed);
  if (state.status !== "signed-in") return state;
  try {
    return {
      status: "signed-in",
      data: await read(state.call),
      manageUrl: `https://shopify.com/${state.shopId}/account`,
    };
  } catch (error) {
    // Account data never goes to logs: the error's class, status and codes.
    console.warn(
      `[accounts] ${path.split("?")[0]} read failed: ${describeCustomerError(error, state.call)}`,
    );
    return { status: "error" };
  }
}

const CURSOR = /^[A-Za-z0-9+/=_-]{1,512}$/;

export function loadOrders(
  page: { after?: string; before?: string },
  refreshed: boolean,
): Promise<AccountPage<Page<OrderSummary>>> {
  const after = page.after && CURSOR.test(page.after) ? page.after : undefined;
  const before =
    !after && page.before && CURSOR.test(page.before) ? page.before : undefined;
  // Cursors can hold + / =, so they're encoded (a bare + reads as a space).
  const params = new URLSearchParams(
    after ? { after } : before ? { before } : {},
  ).toString();
  const query = params ? `?${params}` : "";
  return load(`/account/orders${query}`, refreshed, (call) =>
    fetchOrders(call, { after, before }),
  );
}

// The order only if it's the signed-in customer's: the Customer Account
// API answers null for anyone else's order id, and the page 404s.
export function loadOrder(
  orderId: string,
  refreshed: boolean,
): Promise<AccountPage<OrderDetail | null>> {
  if (!/^\d{1,20}$/.test(orderId)) {
    return Promise.resolve({
      status: "signed-in",
      data: null,
      manageUrl: "",
    });
  }
  return load(`/account/orders/${orderId}`, refreshed, (call) =>
    fetchOrder(call, `gid://shopify/Order/${orderId}`),
  );
}

export function loadProfile(
  refreshed: boolean,
): Promise<AccountPage<CustomerProfile>> {
  return load("/account/profile", refreshed, fetchProfile);
}

export function loadAddresses(
  refreshed: boolean,
): Promise<AccountPage<CustomerAddress[]>> {
  return load("/account/addresses", refreshed, fetchAddresses);
}
