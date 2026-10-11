"use client";

import Script from "next/script";
import { useEffect } from "react";
import {
  gtmSnippet,
  toDataLayer,
  toGoogleConsent,
} from "@/lib/analytics/google";
import { registerAdapter } from "@/lib/analytics/track";
import { ConsentGate, useConsent } from "@/lib/consent/client";

type Gtag = (...args: unknown[]) => void;

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: Gtag;
  }
}

// GTM container, loaded only with analytics consent. Consent Mode updates
// and dataLayer events go through here, so nothing else touches dataLayer.
export function GoogleTagManager({ id }: { id: string }) {
  useEffect(
    () =>
      registerAdapter({
        name: "gtm",
        category: "analytics",
        send(event) {
          window.dataLayer?.push(...toDataLayer(event));
        },
      }),
    [],
  );

  // ConsentModeSync comes first so its update is queued before gtm.js.
  return (
    <>
      <ConsentModeSync />
      <ConsentGate category="analytics">
        <Script id="gtm" strategy="afterInteractive">
          {gtmSnippet(id)}
        </Script>
      </ConsentGate>
    </>
  );
}

function ConsentModeSync() {
  const { ready, state } = useConsent();
  const consent = ready ? JSON.stringify(toGoogleConsent(state)) : null;

  useEffect(() => {
    if (consent) window.gtag?.("consent", "update", JSON.parse(consent));
  }, [consent]);

  return null;
}
