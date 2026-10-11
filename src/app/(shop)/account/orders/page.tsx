import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { AccountGate, AccountNav } from "@/components/account/account-panels";
import { OrdersTable } from "@/components/account/orders";
import { loadOrders } from "@/lib/commerce/account.server";
import { requireShop } from "@/lib/flags";

// Private to the visitor: never indexed.
export const metadata: Metadata = {
  title: "Orders",
  robots: { index: false, follow: false },
};

export default function OrdersPage({
  searchParams,
}: PageProps<"/account/orders">) {
  requireShop();
  return (
    <>
      <h1>Orders</h1>
      <Suspense fallback={<p>Loading your orders.</p>}>
        <Orders searchParams={searchParams} />
      </Suspense>
    </>
  );
}

const one = (value: string | string[] | undefined) =>
  typeof value === "string" ? value : undefined;

async function Orders({
  searchParams,
}: Pick<PageProps<"/account/orders">, "searchParams">) {
  // Per request: reads the session cookie and calls Shopify.
  await connection();
  const params = await searchParams;
  const state = await loadOrders(
    { after: one(params.after), before: one(params.before) },
    params.refreshed === "1",
  );
  if (state.status !== "signed-in")
    return (
      <AccountGate
        status={state.status}
        ended={params.refreshed === "1"}
        returnTo={"/account/orders"}
      />
    );
  return (
    <>
      <AccountNav manageUrl={state.manageUrl} />
      <OrdersTable page={state.data} />
    </>
  );
}
