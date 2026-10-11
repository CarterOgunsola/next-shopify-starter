import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { cache, Suspense } from "react";
import { AccountGate, AccountNav } from "@/components/account/account-panels";
import { OrderDetailView } from "@/components/account/orders";
import { loadOrder } from "@/lib/commerce/account.server";
import { requireShop } from "@/lib/flags";

// One Shopify read per request, shared by the title and the page.
const orderFor = cache(loadOrder);

// Private to the visitor: never indexed. Titled as not found when the
// order isn't the customer's (or doesn't exist), like the page.
export async function generateMetadata({
  params,
  searchParams,
}: PageProps<"/account/orders/[id]">): Promise<Metadata> {
  await connection();
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const state = await orderFor(id, query.refreshed === "1");
  return {
    title:
      state.status === "signed-in" && !state.data ? "Page not found" : "Order",
    robots: { index: false, follow: false },
  };
}

export default function OrderPage({
  params,
  searchParams,
}: PageProps<"/account/orders/[id]">) {
  requireShop();
  return (
    <>
      <p>
        <Link href="/account/orders">All orders</Link>
      </p>
      <Suspense fallback={<p>Loading your order.</p>}>
        <Order params={params} searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Order({
  params,
  searchParams,
}: Pick<PageProps<"/account/orders/[id]">, "params" | "searchParams">) {
  // Per request: reads the session cookie and calls Shopify.
  await connection();
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const state = await orderFor(id, query.refreshed === "1");
  if (state.status !== "signed-in")
    return (
      <AccountGate
        status={state.status}
        ended={query.refreshed === "1"}
        returnTo={`/account/orders/${encodeURIComponent(id)}`}
      />
    );
  // Not this customer's order (or no such order): the API returned nothing.
  if (!state.data) notFound();
  return (
    <>
      <AccountNav manageUrl={state.manageUrl} />
      <OrderDetailView order={state.data} />
    </>
  );
}
