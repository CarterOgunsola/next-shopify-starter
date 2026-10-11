import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import {
  AccountError,
  AccountUnavailable,
  AccountNav,
  OrderList,
  SignInPanel,
  SignOutForm,
} from "@/components/account/account-panels";
import { loadAccount } from "@/lib/commerce/account-route.server";
import { requireShop } from "@/lib/flags";

// Private to the visitor: never indexed.
export const metadata: Metadata = {
  title: "Account",
  robots: { index: false, follow: false },
};

export default function AccountPage({ searchParams }: PageProps<"/account">) {
  requireShop();
  return (
    <>
      <h1>Account</h1>
      <Suspense fallback={<p>Loading your account.</p>}>
        <Account searchParams={searchParams} />
      </Suspense>
    </>
  );
}

// Per request: reads the session cookie.
async function Account({
  searchParams,
}: Pick<PageProps<"/account">, "searchParams">) {
  // Per request: reads the session cookie and calls Shopify.
  await connection();
  const params = await searchParams;
  const state = await loadAccount("/account", params.refreshed === "1");
  switch (state.status) {
    case "unavailable":
      return <AccountUnavailable />;
    case "signed-out":
      return (
        <SignInPanel
          failed={params.login === "failed"}
          needsHttps={params.login === "https"}
          unavailable={params.login === "unavailable"}
          ended={params.refreshed === "1"}
        />
      );
    case "error":
      return <AccountError />;
    case "signed-in": {
      const { customer, orders } = state;
      const name = [customer.firstName, customer.lastName]
        .filter(Boolean)
        .join(" ");
      return (
        <>
          <AccountNav manageUrl={state.manageUrl} />
          <p>
            Signed in{name ? ` as ${name}` : ""}
            {customer.email ? ` (${customer.email})` : ""}.
          </p>
          <section aria-labelledby="recent-orders">
            <h2 id="recent-orders">Recent orders</h2>
            <OrderList orders={orders.slice(0, 5)} />
            {orders.length > 5 && (
              <Link href="/account/orders">All orders</Link>
            )}
          </section>
          <SignOutForm />
        </>
      );
    }
  }
}
