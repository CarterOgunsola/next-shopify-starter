import type { AnalyticsAdapter } from "@/lib/analytics/track";

// Browser-side Klaviyo calls. klaviyo.js only loads with marketing consent,
// so these do nothing without it.

type KlaviyoGlobal = { identify(profile: { email: string }): Promise<unknown> };

declare global {
  interface Window {
    klaviyo?: KlaviyoGlobal;
  }
}

export function klaviyoScriptUrl(siteId: string): string {
  return `https://static.klaviyo.com/onsite/js/${encodeURIComponent(siteId)}/klaviyo.js`;
}

// Ties later onsite activity to the profile that just subscribed.
export function klaviyoIdentify(email: string): void {
  window.klaviyo?.identify({ email }).catch(() => {});
}

// Commerce events for Klaviyo (browse and cart abandonment flows), from our
// track() bus. Registered by KlaviyoOnsite as a marketing adapter that also
// respects a sale/share opt-out. Klaviyo's standard Shopify metric names,
// so its prebuilt flows match. Checkout and order events aren't sent:
// Shopify's Klaviyo integration syncs those.
type KlaviyoQueue = unknown[][];
type KlaviyoTracker = {
  track?(event: string, properties: Record<string, unknown>): unknown;
  trackViewedItem?(item: Record<string, unknown>): unknown;
};

declare global {
  interface Window {
    // klaviyo.js's queue: calls made before it loads run once it does.
    _learnq?: KlaviyoQueue;
  }
}

function send(method: "track" | "trackViewedItem", ...args: unknown[]) {
  const klaviyo = window.klaviyo as
    (KlaviyoGlobal & KlaviyoTracker) | undefined;
  const call = klaviyo?.[method] as ((...a: unknown[]) => unknown) | undefined;
  if (call) {
    void Promise.resolve(call.apply(klaviyo, args)).catch(() => {});
    return;
  }
  (window._learnq ??= []).push([method, ...args]);
}

const absolute = (path: string | undefined) =>
  path ? new URL(path, window.location.origin).href : undefined;

export function klaviyoCommerceAdapter(): AnalyticsAdapter {
  return {
    name: "klaviyo",
    category: "marketing",
    respectsSaleOptOut: true,
    send(event) {
      if (event.name !== "view_item" && event.name !== "add_to_cart") return;
      const [item] = event.payload.items;
      if (!item) return;
      const product = {
        ProductName: item.item_name,
        ProductID: item.item_id,
        Brand: item.item_brand,
        Variant: item.item_variant,
        Price: item.price ? Number(item.price) : undefined,
        URL: absolute(item.item_url),
        ImageURL: item.image_url,
      };
      if (event.name === "view_item") {
        send("track", "Viewed Product", product);
        send("trackViewedItem", {
          Title: product.ProductName,
          ItemId: product.ProductID,
          Url: product.URL,
          ImageUrl: product.ImageURL,
          Metadata: { Brand: product.Brand, Price: product.Price },
        });
        return;
      }
      const quantity = item.quantity;
      send("track", "Added to Cart", {
        $value:
          product.Price !== undefined ? product.Price * quantity : undefined,
        AddedItemProductName: product.ProductName,
        AddedItemProductID: product.ProductID,
        AddedItemPrice: product.Price,
        AddedItemQuantity: quantity,
        AddedItemImageURL: product.ImageURL,
        AddedItemURL: product.URL,
        ItemNames: event.payload.items.map((i) => i.item_name),
      });
    },
  };
}
