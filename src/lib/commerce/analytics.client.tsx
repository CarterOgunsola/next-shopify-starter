"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { track, type CommerceItem } from "@/lib/analytics/track";
import { lineProductUrl } from "./cart-view";
import { legacyId } from "./shopify/ids";
import {
  createCartTracker,
  publishCartViewed,
  publishCollectionViewed,
  publishPageViewed,
  publishProductViewed,
  StorefrontScripts,
} from "./shopify/storefront-analytics";
import type {
  Cart,
  CartLine,
  ProductCard,
  ProductContent,
  ShopAnalyticsConfig,
  VariantState,
} from "./types";

// The one place commerce analytics leave the app: each event goes to
// Shopify's analytics (channel "headless") and to our track() bus (GA4 via
// GTM, and other adapters), both gated by consent. Payloads carry product
// ids, titles and prices only: never customer data.

// Events carry the currency of the prices they report. An empty cart has
// none, so it reports the store's (from Shopify, set by CommerceScripts).
let storeCurrency = "USD";
const id = (gid: string) => legacyId(gid) ?? gid;

const cartTracker = createCartTracker();

// Analytics must never break the shop: a failure here is logged and dropped.
function safely(run: () => void) {
  try {
    run();
  } catch {
    console.warn("[analytics] commerce event failed.");
  }
}

// Shopify's scripts. Rendered in the server HTML (outside Suspense): their
// inline bootstrap only runs when it's part of the page as delivered.
export function CommerceScripts({ shop }: { shop: ShopAnalyticsConfig }) {
  const currency = shop.i18n.currency;
  useEffect(() => {
    storeCurrency = currency;
  }, [currency]);
  return <StorefrontScripts shop={shop} />;
}

// Page views on load and every navigation to a new path. Filter, sort,
// page and variant changes only change the query string, so they aren't
// page views.
export function CommercePageViews() {
  const pathname = usePathname();
  useEffect(() => {
    safely(() => {
      publishPageViewed();
      cartTracker.start();
    });
  }, [pathname]);
  return null;
}

function lineItem(line: CartLine, quantity = line.quantity): CommerceItem {
  return {
    item_id: id(line.merchandise.product.id),
    item_name: line.merchandise.product.title,
    item_variant: line.merchandise.title,
    item_brand: line.merchandise.product.vendor,
    price: line.cost.amountPerQuantity.amount,
    quantity,
    item_url: lineProductUrl(line),
    ...(line.merchandise.image
      ? { image_url: line.merchandise.image.url }
      : {}),
  };
}

export type ViewedProduct = Pick<
  ProductContent,
  "id" | "handle" | "title" | "vendor" | "productType"
> & { imageUrl: string | null };

export function productViewed(product: ViewedProduct, variant: VariantState) {
  safely(() => {
    publishProductViewed(product, variant);
    track("view_item", {
      currency: variant.price.currencyCode,
      items: [
        {
          item_id: id(product.id),
          item_name: product.title,
          item_variant: variant.title,
          item_brand: product.vendor,
          price: variant.price.amount,
          quantity: 1,
          item_url: `/products/${product.handle}`,
          ...(product.imageUrl ? { image_url: product.imageUrl } : {}),
        },
      ],
    });
  });
}

export function listViewed(
  list: { id: string; handle: string; title: string },
  products: ProductCard[],
) {
  safely(() => {
    publishCollectionViewed({ id: list.id, handle: list.handle });
    track("view_item_list", {
      item_list_id: list.handle,
      item_list_name: list.title,
      items: products.map((product) => ({
        item_id: id(product.id),
        item_name: product.title,
        price: product.price.min.amount,
        quantity: 1,
      })),
    });
  });
}

// The search term isn't sent anywhere: visitors type free text, which can
// hold health terms or contact details. Pending legal and privacy review.
// Shopify gets no search event at all: its analytics script reports the
// event with the page's own URL, ?q= included, whatever the payload says.
export function searched(resultCount: number) {
  safely(() => {
    track("search", { result_count: resultCount });
  });
}

export function cartViewed(cart: Cart | null) {
  safely(() => {
    publishCartViewed(cart);
    track("view_cart", {
      currency: cart?.cost.totalAmount.currencyCode ?? storeCurrency,
      items: cart?.lines.map((line) => lineItem(line)) ?? [],
    });
  });
}

// Quantity changes between two confirmed carts, by line.
export function cartChanges(previous: Cart | null, next: Cart | null) {
  const before = new Map(previous?.lines.map((line) => [line.id, line]));
  const after = new Map(next?.lines.map((line) => [line.id, line]));
  const added: CommerceItem[] = [];
  const removed: CommerceItem[] = [];
  for (const [lineId, line] of after) {
    const was = before.get(lineId)?.quantity ?? 0;
    if (line.quantity > was) added.push(lineItem(line, line.quantity - was));
    if (line.quantity < was) removed.push(lineItem(line, was - line.quantity));
  }
  for (const [lineId, line] of before) {
    if (!after.has(lineId)) removed.push(lineItem(line));
  }
  return { added, removed };
}

// Called by the cart store with every confirmed cart (not optimistic ones).
// previous is undefined until the visitor's cart has been read once, so the
// first read isn't counted as additions. A null next cart has expired: it
// resets the baseline without reporting removals.
export function cartConfirmed(
  previous: Cart | null | undefined,
  next: Cart | null,
) {
  safely(() => {
    if (previous === undefined || next === null) {
      cartTracker.reset(next);
      return;
    }
    cartTracker.report(next);
    const { added, removed } = cartChanges(previous, next);
    if (added.length)
      track("add_to_cart", {
        currency: next.cost.totalAmount.currencyCode,
        items: added,
      });
    if (removed.length)
      track("remove_from_cart", {
        currency: next.cost.totalAmount.currencyCode,
        items: removed,
      });
  });
}

// Fires once per key (product handle, list handle, search term).
export function useOnce(key: string | null, fire: () => void) {
  const fired = useRef<string | null>(null);
  useEffect(() => {
    if (!key || fired.current === key) return;
    fired.current = key;
    fire();
  });
}
