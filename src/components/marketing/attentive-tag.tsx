"use client";

import Script from "next/script";
import { ConsentGate } from "@/lib/consent/client";

// Attentive tag (SMS sign-up units), only with marketing consent. Only the
// tag: before building more, confirm with Attentive how dtag.js handles
// client-side navigation, whether it initializes when injected after
// DOMContentLoaded, its consent API, and which events it captures itself.
export function AttentiveTag({ brand }: { brand: string }) {
  return (
    <ConsentGate category="marketing">
      <Script
        id="attentive"
        strategy="afterInteractive"
        src={`https://cdn.attn.tv/${encodeURIComponent(brand)}/dtag.js`}
      />
    </ConsentGate>
  );
}
