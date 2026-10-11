import type { ConsentState } from "@/lib/consent/types";
import type { TrackedEvent } from "./track";

// Google Consent Mode v2.
// https://developers.google.com/tag-platform/security/concepts/consent-mode

type ConsentValue = "granted" | "denied";

export type GoogleConsent = {
  ad_storage: ConsentValue;
  ad_user_data: ConsentValue;
  ad_personalization: ConsentValue;
  analytics_storage: ConsentValue;
  functionality_storage: ConsentValue;
  personalization_storage: ConsentValue;
  security_storage: ConsentValue;
};

const value = (allowed: boolean): ConsentValue =>
  allowed ? "granted" : "denied";

export function toGoogleConsent(state: ConsentState): GoogleConsent {
  // A sale/share opt-out forces the ad signals off even if marketing is on.
  const ads = value(state.marketing && state.saleOfData);
  return {
    ad_storage: ads,
    ad_user_data: ads,
    ad_personalization: ads,
    analytics_storage: value(state.analytics),
    functionality_storage: value(state.preferences),
    personalization_storage: value(state.preferences),
    security_storage: "granted",
  };
}

// Runs before anything else on the page (beforeInteractive). Everything
// starts denied; the consent layer sends an update once the visitor's
// choice and region are known.
export const CONSENT_DEFAULT_SNIPPET = `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}window.gtag=gtag;gtag('consent','default',{ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied',analytics_storage:'denied',functionality_storage:'denied',personalization_storage:'denied',security_storage:'granted',wait_for_update:500});`;

export function gtmSnippet(id: string): string {
  return `(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer',${JSON.stringify(id)});`;
}

const ECOMMERCE = new Set<TrackedEvent["name"]>([
  "view_item",
  "view_item_list",
  "add_to_cart",
  "remove_from_cart",
  "view_cart",
]);

// "24.50" -> 2450, without float rounding.
function cents(amount: string): number {
  const [whole, fraction = ""] = amount.split(".");
  return Number(whole) * 100 + Number(fraction.padEnd(2, "0").slice(0, 2));
}

// What one tracked event pushes to the dataLayer. GA4 ecommerce tags read
// only the ecommerce object, and the dataLayer merges every push into one
// model, so ecommerce is cleared first: an earlier event's items or
// currency must never carry over.
export function toDataLayer(event: TrackedEvent): Record<string, unknown>[] {
  const base = { event: event.name, event_id: event.eventId };
  if (!ECOMMERCE.has(event.name)) return [{ ...base, ...event.payload }];
  const payload = event.payload as {
    items: { price?: string; quantity: number }[];
  };
  const total = payload.items.reduce(
    (sum, item) => sum + (item.price ? cents(item.price) * item.quantity : 0),
    0,
  );
  return [
    { ecommerce: null },
    {
      ...base,
      ecommerce: {
        ...event.payload,
        items: payload.items.map((item) => ({
          ...item,
          ...(item.price ? { price: cents(item.price) / 100 } : {}),
        })),
        value: total / 100,
      },
    },
  ];
}
