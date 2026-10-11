import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { AccountGate, AccountNav } from "@/components/account/account-panels";
import { AddressBook } from "@/components/account/address-book";
import { loadAddresses } from "@/lib/commerce/account.server";
import { requireShop } from "@/lib/flags";

// Private to the visitor: never indexed.
export const metadata: Metadata = {
  title: "Addresses",
  robots: { index: false, follow: false },
};

export default function AddressesPage({
  searchParams,
}: PageProps<"/account/addresses">) {
  requireShop();
  return (
    <>
      <h1>Addresses</h1>
      <Suspense fallback={<p>Loading your addresses.</p>}>
        <Addresses searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Addresses({
  searchParams,
}: Pick<PageProps<"/account/addresses">, "searchParams">) {
  // Per request: reads the session cookie and calls Shopify.
  await connection();
  const params = await searchParams;
  const state = await loadAddresses(params.refreshed === "1");
  if (state.status !== "signed-in")
    return (
      <AccountGate
        status={state.status}
        ended={params.refreshed === "1"}
        returnTo={"/account/addresses"}
      />
    );
  return (
    <>
      <AccountNav manageUrl={state.manageUrl} />
      <AddressBook addresses={state.data} />
    </>
  );
}
