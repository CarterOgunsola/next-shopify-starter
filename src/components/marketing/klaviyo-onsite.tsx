"use client";

import Script from "next/script";
import { useEffect } from "react";
import { registerAdapter } from "@/lib/analytics/track";
import { ConsentGate } from "@/lib/consent/client";
import {
  klaviyoCommerceAdapter,
  klaviyoScriptUrl,
} from "@/lib/marketing/klaviyo-browser";

// klaviyo.js (hosted popups and flyouts, Active on Site), only with
// marketing consent, plus product views and adds to cart from the track()
// bus, which applies the same consent.
export function KlaviyoOnsite({ siteId }: { siteId: string }) {
  useEffect(() => registerAdapter(klaviyoCommerceAdapter()), []);
  return (
    <ConsentGate category="marketing">
      <Script
        id="klaviyo"
        strategy="afterInteractive"
        src={klaviyoScriptUrl(siteId)}
      />
    </ConsentGate>
  );
}
