"use client";

import { BRAND } from "@/lib/brand";
import { useConsent } from "@/lib/consent/client";

// Placeholder copy. Final wording needs legal and privacy review before launch.
export function ConsentBanner() {
  const { bannerOpen, acceptAll, rejectAll, openPreferences } = useConsent();
  if (!bannerOpen) return null;

  return (
    <section aria-labelledby="consent-banner-title">
      <h2 id="consent-banner-title">Cookies on {BRAND.name}</h2>
      <p>
        We use cookies for analytics and marketing. You can accept them, reject
        them or choose which ones to allow.
      </p>
      <button type="button" onClick={acceptAll}>
        Accept all
      </button>
      <button type="button" onClick={rejectAll}>
        Reject all
      </button>
      <button type="button" onClick={openPreferences}>
        Choose cookies
      </button>
    </section>
  );
}
