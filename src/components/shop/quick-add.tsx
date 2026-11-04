"use client";

import Link from "next/link";
import { useId, useRef, useState } from "react";
import { useCart } from "@/lib/commerce/cart.client";
import type { ProductCard, QuickAddProduct } from "@/lib/commerce";
import dynamic from "next/dynamic";

// The purchase panel loads with the dialog's data (on intent), not with
// the listing.
const loadPurchase = () =>
  import("./product-purchase").then((m) => m.ProductPurchase);
const ProductPurchase = dynamic(loadPurchase, { ssr: false });
import { ChunkBoundary } from "../chunk-boundary";

// Quick add on a product tile. A product whose only variant needs no
// choices is added straight away. Others open a dialog with the product
// page's purchase panel, its data fetched when the visitor shows intent
// (hover or focus; a tap on touch screens), from a shared-cached GET.
// label: the button's text where a design names it; its accessible name
// stays specific to the product.
export function QuickAdd({
  product,
  label,
}: {
  product: ProductCard;
  label?: string;
}) {
  if (!product.available) return null;
  return product.quickAddVariantId ? (
    <DirectAdd
      product={product}
      variantId={product.quickAddVariantId}
      label={label}
    />
  ) : (
    <QuickAddDialog product={product} label={label} />
  );
}

function DirectAdd({
  product,
  variantId,
  label = "Add",
}: {
  product: ProductCard;
  variantId: string;
  label?: string;
}) {
  const cart = useCart();
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const errorId = useId();
  return (
    <>
      <button
        type="button"
        aria-label={`Add ${product.title} to cart`}
        aria-disabled={adding || undefined}
        aria-describedby={error ? errorId : undefined}
        onClick={async () => {
          if (adding) return;
          setAdding(true);
          setError(null);
          const result = await cart.add([
            { merchandiseId: variantId, quantity: 1 },
          ]);
          setAdding(false);
          if (!result.ok) setError(result.error);
        }}
      >
        {adding ? "Adding…" : label}
      </button>
      {error && (
        <p id={errorId} role="alert">
          {error}
        </p>
      )}
    </>
  );
}

// Per page load: one request per product, however often it's opened.
const loaded = new Map<string, Promise<QuickAddProduct | null>>();

function loadQuickAdd(handle: string): Promise<QuickAddProduct | null> {
  let request = loaded.get(handle);
  if (!request) {
    request = fetch(
      `/api/commerce/quick-add?handle=${encodeURIComponent(handle)}`,
    )
      .then((response) =>
        response.ok
          ? (response.json() as Promise<{ product: QuickAddProduct }>)
          : null,
      )
      .then((body) => body?.product ?? null)
      .catch(() => null)
      .then((product) => {
        // A failure isn't remembered: the next try asks again.
        if (!product) loaded.delete(handle);
        return product;
      });
    loaded.set(handle, request);
  }
  return request;
}

function QuickAddDialog({
  product,
  label = "Quick add",
}: {
  product: ProductCard;
  label?: string;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<QuickAddProduct | null | undefined>();
  const titleId = useId();
  // On intent; a failure here is shown when the dialog opens.
  const prefetch = () => {
    void loadQuickAdd(product.handle);
    loadPurchase().catch(() => {});
  };

  // The dialog says it's loading until both its data and the purchase
  // panel's code are in; either failing reads as options that couldn't
  // load.
  const show = async () => {
    setOpen(true);
    dialog.current?.showModal();
    const [loaded, code] = await Promise.all([
      loadQuickAdd(product.handle),
      loadPurchase().catch(() => null),
    ]);
    setData(code ? loaded : null);
  };

  return (
    <>
      <button
        type="button"
        aria-haspopup="dialog"
        aria-label={`Quick add ${product.title}`}
        onPointerEnter={prefetch}
        onFocus={prefetch}
        onClick={show}
      >
        {label}
      </button>
      <dialog
        ref={dialog}
        aria-labelledby={titleId}
        // The page holds still behind it (globals.css) until its close
        // event, which every way of closing it fires (Escape included).
        data-lock-scroll={open ? "on" : undefined}
        onClose={() => {
          setOpen(false);
          setData(undefined);
        }}
      >
        <h2 id={titleId}>{product.title}</h2>
        {/* Mounted only while open: the panel's live requests and focus
            targets go away with the dialog. */}
        {/* Announced: the dialog fills in after it opens. */}
        <p aria-live="polite">
          {open && data === undefined ? "Loading options." : ""}
        </p>
        {open && data === null && (
          <p role="alert">This product&apos;s options couldn&apos;t load.</p>
        )}
        {open && data && (
          <ChunkBoundary>
            <ProductPurchase
              handle={data.handle}
              options={data.options}
              sellingPlanGroups={data.sellingPlanGroups}
              requiresSellingPlan={data.requiresSellingPlan}
              initialView={data.initialView}
              isGiftCard={data.isGiftCard}
              backInStock={data.backInStock}
              marketingOptIn={data.marketingOptIn}
              inUrl={false}
              // Choose and add: express checkout is on the product page.
              express={false}
              // Close first, so focus is back on this tile when the cart
              // drawer opens and remembers where to return it.
              onAdded={() => dialog.current?.close()}
            />
          </ChunkBoundary>
        )}
        <p>
          <Link href={`/products/${product.handle}`}>View full details</Link>
        </p>
        <button type="button" onClick={() => dialog.current?.close()}>
          Close
        </button>
      </dialog>
    </>
  );
}
