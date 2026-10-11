import "server-only";
import { redirect } from "next/navigation";
import { getAccountState } from "./customer.server";
import type { AccountState } from "./types";

// The account state for a page, sending an expired session through
// /account/refresh once (the refresh handler can set the cookie; pages
// can't). refreshed marks the return trip so a failed refresh can't loop.
// A refresh Shopify rejects clears the session (signed out); one that
// failed for a passing reason (network, timeout, 5xx) keeps it, so the
// page offers to try again instead of claiming the customer signed out.
export async function loadAccount(
  path: string,
  refreshed: boolean,
): Promise<Exclude<AccountState, { status: "needs-refresh" }>> {
  const state = await getAccountState();
  if (state.status !== "needs-refresh") return state;
  if (refreshed) {
    console.warn("[accounts] no access token after a refresh.");
    return { status: "error" };
  }
  const back = `${path}${path.includes("?") ? "&" : "?"}refreshed=1`;
  // Through link-cart, so the visitor's cart is attached to the customer
  // again with the new token.
  const linked = `/account/link-cart?return_to=${encodeURIComponent(back)}`;
  redirect(`/account/refresh?return_to=${encodeURIComponent(linked)}`);
}
