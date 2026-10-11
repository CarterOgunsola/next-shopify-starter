import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { AccountGate, AccountNav } from "@/components/account/account-panels";
import { ProfileForm } from "@/components/account/profile-form";
import { loadProfile } from "@/lib/commerce/account.server";
import { requireShop } from "@/lib/flags";

// Private to the visitor: never indexed.
export const metadata: Metadata = {
  title: "Profile",
  robots: { index: false, follow: false },
};

export default function ProfilePage({
  searchParams,
}: PageProps<"/account/profile">) {
  requireShop();
  return (
    <>
      <h1>Profile</h1>
      <Suspense fallback={<p>Loading your profile.</p>}>
        <Profile searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Profile({
  searchParams,
}: Pick<PageProps<"/account/profile">, "searchParams">) {
  // Per request: reads the session cookie and calls Shopify.
  await connection();
  const params = await searchParams;
  const state = await loadProfile(params.refreshed === "1");
  if (state.status !== "signed-in")
    return (
      <AccountGate
        status={state.status}
        ended={params.refreshed === "1"}
        returnTo={"/account/profile"}
      />
    );
  return (
    <>
      <AccountNav manageUrl={state.manageUrl} />
      <ProfileForm profile={state.data} manageUrl={state.manageUrl} />
    </>
  );
}
