"use client";

import {
  AnalyticsEvent,
  trackCartAnalytics,
  type AnalyticsCart,
  type StorefrontAnalytics,
} from "@shopify/hydrogen";
import { ShopifyScripts } from "@shopify/hydrogen/react";
import type { CurrencyCode } from "@shopify/hydrogen/storefront-api-types";
import { useRouter } from "next/navigation";
import { routeTemplates } from "./route-templates";
import { carriesVisitorText, cleanUrl } from "@/lib/analytics/clean-url";
import { onConsent } from "@/lib/consent/client";
import type { ConsentState } from "@/lib/consent";
import type {
  Cart,
  ProductContent,
  ShopAnalyticsConfig,
  VariantState,
} from "../types";

// Shopify's browser analytics (Hydrogen's ShopifyScripts and event bus) on
// our own consent. Events are buffered until Shopify's Customer Privacy API
// has our visitor's choice, and only delivered when it allows them.

export function toShopifyConsent(state: ConsentState) {
  return {
    analytics: state.analytics,
    marketing: state.marketing,
    preferences: state.preferences,
    sale_of_data: state.saleOfData,
  };
}

// Shopify's setTrackingConsent is typed as returning a promise; Shopify's
// own docs show a callback instead. Settles on whichever comes first.
type ConsentCallback = (result?: { error?: unknown }) => void;
type SetTrackingConsent = (
  consent: Record<string, unknown>,
  callback: ConsentCallback,
) => unknown;

function setTrackingConsent(
  privacy: { setTrackingConsent: unknown },
  state: ConsentState,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const callback: ConsentCallback = (result) =>
      result?.error ? reject(result.error) : resolve();
    const returned = (privacy.setTrackingConsent as SetTrackingConsent)(
      toShopifyConsent(state),
      callback,
    );
    if (returned instanceof Promise) returned.then(() => resolve(), reject);
  });
}

// custom-banner setup: hand Shopify the visitor's choice once it's known,
// then every change, once each. Subscribes before the first choice is read
// so no change is missed, and unsubscribes if setup fails. Resolving tells
// Hydrogen consent is in place.
//
// Hydrogen holds the events published until then (in memory, up to 500)
// and, when setup resolves, delivers them if analytics is allowed or
// discards them for good if not. So setup waits for a choice that settles
// it: the visitor's own, or a region default that already allows analytics
// (opt-out regions). In opt-in regions nothing leaves the browser before
// the visitor decides; accepting on the landing page then delivers its
// page and product views (with the landing URL), rejecting discards them,
// and a visitor who never decides sends nothing.
export function settlesConsent(state: ConsentState): boolean {
  return state.decided || state.analytics;
}

export async function bridgeConsent(): Promise<void> {
  const privacy = window.Shopify?.customerPrivacy;
  if (!privacy) throw new Error("Shopify Customer Privacy API missing");
  const sync = (state: ConsentState) => setTrackingConsent(privacy, state);

  let synced: ConsentState | null = null;
  let latest: ConsentState | null = null;
  let ready = false;
  let first!: (state: ConsentState) => void;
  const firstChoice = new Promise<ConsentState>((resolve) => (first = resolve));
  const stop = onConsent((state) => {
    latest = state;
    if (!ready) {
      if (settlesConsent(state)) first(state);
      return;
    }
    synced = state;
    void sync(state).catch(() => {
      console.warn("[analytics] Shopify consent update failed.");
    });
  });
  try {
    synced = await firstChoice;
    await sync(synced);
    ready = true;
    // A change that arrived while the first choice was being sent.
    if (latest && latest !== synced) {
      synced = latest;
      await sync(latest);
    }
  } catch (error) {
    stop();
    throw error;
  }
}

export function StorefrontScripts({ shop }: { shop: ShopAnalyticsConfig }) {
  const router = useRouter();
  return (
    <ShopifyScripts
      shop={shop}
      // Shopify's scripts (Shop Pay, app embeds) resolve its standard URLs
      // to this site's routes and navigate client-side.
      routes={routeTemplates}
      navigate={(url: string) => router.push(url)}
      i18n={shop.i18n as Parameters<typeof ShopifyScripts>[0]["i18n"]}
      analytics={{ channel: "headless" }}
      consent={{ mode: "custom-banner", setup: bridgeConsent }}
    />
  );
}

// Shopify fills an event's url from location.href when it has none, which
// would send search terms and filter values. Every view event gets the
// cleaned URL instead.
function pageUrl(): string {
  return cleanUrl(window.location.href);
}

const onVisitorTextPage = () =>
  typeof window !== "undefined" &&
  !!window.location &&
  carriesVisitorText(window.location.href);

// No Shopify events on a search page or a filtered one: Shopify's
// analytics script reports each event with the page's location, query
// included, whatever its url says.
function bus(): StorefrontAnalytics | null {
  if (typeof window === "undefined") return null;
  if (onVisitorTextPage()) return null;
  return (window.Shopify?.analytics as StorefrontAnalytics | undefined) ?? null;
}

export function publishPageViewed() {
  bus()?.publish(AnalyticsEvent.PAGE_VIEWED, { url: pageUrl() });
}

export function publishProductViewed(
  product: Pick<ProductContent, "id" | "title" | "vendor" | "productType">,
  variant: VariantState,
) {
  bus()?.publish(AnalyticsEvent.PRODUCT_VIEWED, {
    url: pageUrl(),
    products: [
      {
        id: product.id,
        title: product.title,
        price: {
          amount: variant.price.amount,
          currencyCode: variant.price.currencyCode as CurrencyCode,
        },
        vendor: product.vendor,
        variantId: variant.id,
        variantTitle: variant.title,
        quantity: 1,
        sku: variant.sku,
        productType: product.productType,
      },
    ],
  });
}

export function publishCollectionViewed(collection: {
  id: string;
  handle: string;
}) {
  bus()?.publish(AnalyticsEvent.COLLECTION_VIEWED, {
    url: pageUrl(),
    collection,
  });
}

export function toAnalyticsCart(cart: Cart): AnalyticsCart {
  return {
    id: cart.analyticsId,
    updatedAt: cart.updatedAt,
    cost: cart.cost,
    lines: {
      nodes: cart.lines.map((line) => ({
        id: line.id,
        quantity: line.quantity,
        merchandise: {
          id: line.merchandise.id,
          title: line.merchandise.title,
          price: line.cost.amountPerQuantity,
          sku: line.merchandise.sku,
          product: {
            id: line.merchandise.product.id,
            title: line.merchandise.product.title,
            vendor: line.merchandise.product.vendor,
            productType: line.merchandise.product.productType,
            handle: line.merchandise.product.handle,
          },
        },
      })),
    },
  };
}

// The raw cart shape Hydrogen's tracker reads (it builds its own analytics
// cart from this).
function toTrackerCart(cart: Cart) {
  return {
    id: cart.analyticsId,
    updatedAt: cart.updatedAt,
    cost: cart.cost,
    lines: {
      nodes: cart.lines.map((line) => ({
        id: line.id,
        quantity: line.quantity,
        cost: { amountPerQuantity: line.cost.amountPerQuantity },
        merchandise: {
          id: line.merchandise.id,
          title: line.merchandise.title,
          sku: line.merchandise.sku,
          product: line.merchandise.product,
        },
      })),
    },
  };
}

export function publishCartViewed(cart: Cart | null) {
  bus()?.publish(AnalyticsEvent.CART_VIEWED, {
    url: pageUrl(),
    cart: cart ? toAnalyticsCart(cart) : null,
  });
}

// Hydrogen's cart tracker publishes add, remove and update events from
// confirmed cart changes. It reads a store shaped like Hydrogen's own cart
// store; this feeds it our confirmed carts (never optimistic ones).
export function createCartTracker() {
  type State = Parameters<
    Parameters<Parameters<typeof trackCartAnalytics>[0]["subscribe"]>[0]
  >[0];
  const empty = {
    id: "",
    lines: { nodes: [] },
  };
  let state = {
    data: empty,
    pending: {
      cost: false,
      lines: new Set(),
      discountCodes: new Set(),
      note: false,
      attributes: false,
    },
    revalidating: false,
  } as unknown as State;
  const listeners = new Set<(state: State) => void>();
  const store = {
    getState: () => state,
    subscribe: (listener: (state: State) => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  } as unknown as Parameters<typeof trackCartAnalytics>[0];

  const setCart = (cart: Cart | null) => {
    state = {
      ...(state as object),
      data: cart ? toTrackerCart(cart) : empty,
    } as unknown as State;
  };

  // Hydrogen's tracker takes the store's cart at start as its baseline and
  // reports every later change. It only runs once Shopify's bus exists and
  // the visitor's cart has been read, so the cart they arrive with is never
  // reported as added (Hydrogen's own check for that relies on
  // localStorage, which can be empty or blocked).
  let stop: (() => void) | null = null;
  let wanted = false;
  let baselined = false;
  const begin = () => {
    if (stop || !wanted || !baselined || !bus()) return;
    stop = trackCartAnalytics(store);
  };
  return {
    // Safe to call repeatedly.
    start() {
      wanted = true;
      begin();
    },
    // A new baseline, with no events: the first cart read, or an expired
    // cart (null), which isn't the visitor removing anything.
    reset(cart: Cart | null) {
      stop?.();
      stop = null;
      setCart(cart);
      baselined = true;
      begin();
    },
    // A confirmed change: Hydrogen reports it against the baseline.
    // On a search or filtered page (see bus()) it's a new baseline instead,
    // so nothing goes out with that page's location.
    report(cart: Cart) {
      if (onVisitorTextPage()) {
        stop?.();
        stop = null;
        setCart(cart);
        return;
      }
      // Stopped on such a page: start again from the last cart first.
      begin();
      setCart(cart);
      for (const listener of listeners) listener(state);
    },
    stop() {
      stop?.();
      stop = null;
    },
  };
}
