import { BRAND } from "@/lib/brand";
import type { Metadata } from "next";
import { Fragment, Suspense } from "react";
import Script from "next/script";
import { GoogleTagManager } from "@/components/analytics/google-tag-manager";
import { PageViewTracker } from "@/components/analytics/page-view-tracker";
import { AttentiveTag } from "@/components/marketing/attentive-tag";
import { KlaviyoOnsite } from "@/components/marketing/klaviyo-onsite";
import { ConsentBanner } from "@/components/consent/consent-banner";
import { ConsentPreferences } from "@/components/consent/consent-preferences";
import { SiteFooter } from "@/components/site-footer";
import { SiteNav } from "@/components/site-nav";
import { CartDrawer } from "@/components/shop/cart-drawer";
import { CONSENT_DEFAULT_SNIPPET } from "@/lib/analytics/google";
import {
  CommercePageViews,
  CommerceScripts,
} from "@/lib/commerce/analytics.client";
import { publicContext } from "@/lib/commerce/audience";
import { CartProvider } from "@/lib/commerce/cart.client";
import { loadShopAnalyticsConfig } from "@/lib/commerce/catalog.server";
import { ConsentProvider } from "@/lib/consent/client";
import { publicEnv } from "@/lib/env";
import { isShopEnabled } from "@/lib/flags";
// Scaffold styles (quiet defaults until the design lands). Remove this line
// and src/styles/scaffold.css to drop them; nothing else uses them.
import "@/styles/scaffold.css";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(publicEnv.NEXT_PUBLIC_SITE_URL),
  title: {
    template: `%s | ${BRAND.name}`,
    default: BRAND.name,
  },
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const gtmId = publicEnv.NEXT_PUBLIC_GTM_ID;
  const klaviyoSiteId = publicEnv.NEXT_PUBLIC_KLAVIYO_SITE_ID;
  const attentiveBrand = publicEnv.NEXT_PUBLIC_ATTENTIVE_BRAND;
  // The cart reads the visitor's cart in the browser, so static pages stay
  // static. Without the shop, nothing cart-related renders.
  const shopEnabled = isShopEnabled();
  const Cart = shopEnabled ? CartProvider : Fragment;
  const shopAnalytics = shopEnabled
    ? await loadShopAnalyticsConfig(publicContext())
    : null;

  return (
    <html lang="en">
      <body>
        {/* The only script allowed to run before consent is known. */}
        {gtmId && (
          <Script id="consent-default" strategy="beforeInteractive">
            {CONSENT_DEFAULT_SNIPPET}
          </Script>
        )}
        <ConsentProvider>
          <Cart>
            <header>
              <SiteNav />
            </header>
            <main>{children}</main>
            <SiteFooter />
            {shopEnabled && <CartDrawer />}
          </Cart>
          {shopAnalytics && (
            // Shopify's own analytics; delivery waits for consent.
            <>
              <CommerceScripts shop={shopAnalytics} />
              <Suspense fallback={null}>
                <CommercePageViews />
              </Suspense>
            </>
          )}
          <ConsentBanner />
          <ConsentPreferences />
          {gtmId && <GoogleTagManager id={gtmId} />}
          {klaviyoSiteId && <KlaviyoOnsite siteId={klaviyoSiteId} />}
          {attentiveBrand && <AttentiveTag brand={attentiveBrand} />}
          {/* Reads the URL, which a page with unknown params (an order
              page) only knows at request time. */}
          <Suspense fallback={null}>
            <PageViewTracker />
          </Suspense>
        </ConsentProvider>
      </body>
    </html>
  );
}
