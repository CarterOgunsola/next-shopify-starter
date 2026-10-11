import type { ConsentCategory, ConsentState } from "@/lib/consent/types";

// One typed event bus. Components call track(); they never touch vendor
// globals (dataLayer, klaviyo, fbq, ...). Each destination registers an
// adapter that declares the consent category it needs.
//
// No PII or health data in payloads: ids, titles, prices, positions only.

// Commerce events use GA4's ecommerce names and item fields. Prices are
// Shopify's decimal strings.
export type CommerceItem = {
  item_id: string;
  item_name: string;
  item_variant?: string;
  item_brand?: string;
  price?: string;
  quantity: number;
  // Site path and image for marketing destinations (Klaviyo's product
  // feed and browse-abandonment emails). GA4 ignores them.
  item_url?: string;
  image_url?: string;
};

type CommerceItems = { currency: string; items: CommerceItem[] };

export type AnalyticsEvents = {
  page_view: { path: string; title?: string; location?: string };
  view_item: CommerceItems;
  view_item_list: {
    item_list_id: string;
    item_list_name: string;
    items: CommerceItem[];
  };
  // No search_term: free text can hold health terms or contact details.
  search: { result_count: number };
  add_to_cart: CommerceItems;
  remove_from_cart: CommerceItems;
  view_cart: CommerceItems;
  newsletter_signup: { source: string; channels: ("email" | "sms")[] };
  video_play: VideoEvent;
  video_complete: VideoEvent;
};

type VideoEvent = {
  videoId: string;
  title: string;
  provider: "youtube" | "native";
  // The page the video sits on.
  contentSlug?: string;
};

export type AnalyticsEventName = keyof AnalyticsEvents;

export type TrackedEvent = {
  [K in AnalyticsEventName]: {
    name: K;
    payload: AnalyticsEvents[K];
    // Unique per action. Lets server mirrors dedupe against browser events.
    eventId: string;
    timestamp: number;
  };
}[AnalyticsEventName];

export type AnalyticsAdapter = {
  name: string;
  category: Exclude<ConsentCategory, "necessary">;
  // true: the adapter only receives events when sale/share is allowed too.
  respectsSaleOptOut?: boolean;
  send(event: TrackedEvent): void;
};

type ConsentReader = () => ConsentState | null;

const adapters = new Map<string, AnalyticsAdapter>();
let readConsent: ConsentReader = () => null;

export function registerAdapter(adapter: AnalyticsAdapter): () => void {
  adapters.set(adapter.name, adapter);
  return () => {
    if (adapters.get(adapter.name) === adapter) adapters.delete(adapter.name);
  };
}

// Wired once by the consent provider.
export function setConsentReader(reader: ConsentReader): void {
  readConsent = reader;
}

export function allowedFor(
  adapter: AnalyticsAdapter,
  consent: ConsentState | null,
): boolean {
  if (!consent) return false;
  if (!consent[adapter.category]) return false;
  if (adapter.respectsSaleOptOut && !consent.saleOfData) return false;
  return true;
}

export function track<K extends AnalyticsEventName>(
  name: K,
  payload: AnalyticsEvents[K],
): void {
  const event = {
    name,
    payload,
    eventId: crypto.randomUUID(),
    timestamp: Date.now(),
  } as TrackedEvent;
  const consent = readConsent();
  for (const adapter of adapters.values()) {
    if (!allowedFor(adapter, consent)) continue;
    try {
      adapter.send(event);
    } catch (error) {
      // A broken vendor must not break the page. Log the event name only.
      console.error(`[analytics] ${adapter.name} failed on ${name}`, error);
    }
  }
}

// Tests only.
export function resetAnalytics(): void {
  adapters.clear();
  readConsent = () => null;
}
