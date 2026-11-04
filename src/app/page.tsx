import type { Metadata } from "next";
import Link from "next/link";
import { JsonLd } from "@/components/json-ld";
import { BRAND } from "@/lib/brand";
import { publicEnv } from "@/lib/env";
import { isShopEnabled } from "@/lib/flags";
import { siteJsonLd } from "@/lib/seo/site-json-ld";

export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

// A minimal home page. Replace it with your own, or render it from a CMS
// (src/lib/content).
export default function HomePage() {
  const shop = isShopEnabled();
  return (
    <>
      {siteJsonLd(publicEnv.NEXT_PUBLIC_SITE_URL, { search: shop }).map(
        (data) => (
          <JsonLd key={String(data["@type"])} data={data} />
        ),
      )}
      <h1>{BRAND.siteName}</h1>
      {shop ? (
        <p>
          <Link href="/shop">Shop all products</Link>
        </p>
      ) : (
        <p>The shop isn&apos;t open yet.</p>
      )}
    </>
  );
}
