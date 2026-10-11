import Link from "next/link";
import { formatMoney, type OrderSummary } from "@/lib/commerce";
import { signInHref } from "@/lib/commerce/account-messages";

// Sign-in and sign-out are plain links and forms (full page loads): they
// redirect to Shopify, which client-side navigation can't follow.

// returnTo: the account page to come back to after signing in.
export function SignInPanel({
  failed,
  needsHttps = false,
  unavailable = false,
  ended = false,
  returnTo = "/account",
}: {
  failed: boolean;
  needsHttps?: boolean;
  unavailable?: boolean;
  // Signed out on the way back from a token refresh: the session ended.
  ended?: boolean;
  returnTo?: string;
}) {
  return (
    <section aria-labelledby="sign-in">
      <h2 id="sign-in">Sign in</h2>
      {ended && (
        <p role="alert">Your session ended. Sign in again to continue.</p>
      )}
      {failed && (
        <p role="alert">Sign-in didn&apos;t complete. Please try again.</p>
      )}
      {unavailable && (
        <p role="alert">
          Sign-in isn&apos;t available right now. Try again in a few minutes.
        </p>
      )}
      {needsHttps && (
        <p role="alert">
          Sign-in needs a secure (HTTPS) connection. Locally, run pnpm
          dev:https.
        </p>
      )}
      <p>Sign in to see your orders. We&apos;ll email you a one-time code.</p>
      <p>
        <a href={signInHref(returnTo)}>Sign in</a>
      </p>
    </section>
  );
}

export { SignOutForm } from "./sign-out-form";

// Recent orders on the account page: each opens its order page here.
export function OrderList({ orders }: { orders: OrderSummary[] }) {
  if (orders.length === 0) return <p>No orders yet.</p>;
  return (
    <ul aria-label="Orders">
      {orders.map((order) => (
        <li key={order.id}>
          <Link href={`/account/orders/${order.legacyId}`}>{order.name}</Link> ·{" "}
          {formatDate(order.processedAt)} · {formatMoney(order.total)} ·{" "}
          {statusLabel(order)}
        </li>
      ))}
    </ul>
  );
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { dateStyle: "medium" });
}

export function statusLabel(
  order: Pick<OrderSummary, "financialStatus" | "fulfillmentStatus">,
): string {
  const words = (value: string) => value.toLowerCase().replace(/_/g, " ");
  return order.financialStatus
    ? `${words(order.financialStatus)}, ${words(order.fulfillmentStatus)}`
    : words(order.fulfillmentStatus);
}

// The account's pages, and what Shopify's hosted account handles: apps'
// pages (subscriptions, returns) and payment methods.
export function AccountNav({ manageUrl }: { manageUrl: string }) {
  return (
    <nav aria-label="Account">
      <ul>
        <li>
          <Link href="/account">Overview</Link>
        </li>
        <li>
          <Link href="/account/orders">Orders</Link>
        </li>
        <li>
          <Link href="/account/profile">Profile</Link>
        </li>
        <li>
          <Link href="/account/addresses">Addresses</Link>
        </li>
        {manageUrl && (
          // Shopify's hosted account: one place, so one link, saying what's
          // there.
          <li>
            <a href={manageUrl} aria-describedby="manage-on-shopify">
              Manage on Shopify
            </a>
            {/* Its own line, so it reads as a note on the link. */}
            <p id="manage-on-shopify">
              Subscriptions, returns and payment methods.
            </p>
          </li>
        )}
      </ul>
    </nav>
  );
}

// What an account page shows instead of the customer's data.
export function AccountGate({
  status,
  failed = false,
  needsHttps = false,
  ended = false,
  returnTo,
}: {
  status: "unavailable" | "signed-out" | "error";
  failed?: boolean;
  needsHttps?: boolean;
  ended?: boolean;
  returnTo?: string;
}) {
  if (status === "unavailable") return <AccountUnavailable />;
  if (status === "error") return <AccountError />;
  return (
    <SignInPanel
      failed={failed}
      needsHttps={needsHttps}
      ended={ended}
      returnTo={returnTo}
    />
  );
}

export function AccountUnavailable() {
  return <p>Accounts aren&apos;t available yet.</p>;
}

export function AccountError() {
  return (
    <p role="alert">
      We couldn&apos;t load your account. <Link href="/account">Try again</Link>
      .
    </p>
  );
}
