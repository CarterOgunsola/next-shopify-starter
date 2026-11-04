"use client";

import Link from "next/link";
import { useEffect, useId, useRef } from "react";
import { cartViewed } from "@/lib/commerce/analytics.client";
import { useCart } from "@/lib/commerce/cart.client";
import dynamic from "next/dynamic";
import { ChunkBoundary } from "../chunk-boundary";

// The drawer's contents load when it first opens, not with every page.
const CartPanel = dynamic(
  () => import("./cart-panel").then((m) => m.CartPanel),
  { ssr: false, loading: () => <p>Loading your cart.</p> },
);
const PairsWellWith = dynamic(
  () => import("./pairs-well-with").then((m) => m.PairsWellWith),
  { ssr: false },
);

// The cart in a native modal dialog: focus moves in and is trapped, Escape
// closes it and focus returns to what opened it, and the page holds still
// behind it while it's open (data-lock-scroll, in globals.css). Also holds
// the cart's aria-live region, so changes are announced on every page.
export function CartDrawer() {
  const { drawerOpen, closeDrawer, announcement, cart, lastAdded } = useCart();
  const dialog = useRef<HTMLDialogElement>(null);
  const opener = useRef<Element | null>(null);
  const titleId = useId();
  const title = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (drawerOpen && !element.open) {
      opener.current = document.activeElement;
      element.showModal();
      // Start on the heading, so screen readers hear "Your cart" before the
      // first control.
      title.current?.focus();
      cartViewed(cart);
    }
    if (!drawerOpen && element.open) element.close();
    // Only when the drawer opens, not on every cart change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawerOpen]);

  // The browser returns focus to what had it before the dialog opened. When
  // that's gone or can't take focus, use the header cart button instead.
  const onClose = () => {
    closeDrawer();
    requestAnimationFrame(() => {
      const active = document.activeElement;
      if (active && active !== document.body) return;
      const back = opener.current;
      const target =
        back instanceof HTMLElement &&
        back.isConnected &&
        back !== document.body
          ? back
          : document.querySelector<HTMLElement>("[data-cart-button]");
      target?.focus();
    });
  };

  return (
    <>
      <dialog
        ref={dialog}
        aria-labelledby={titleId}
        // drawerOpen turns false on the dialog's close event, which every
        // way of closing it fires (Escape included).
        data-lock-scroll={drawerOpen ? "on" : undefined}
        onClose={onClose}
      >
        <h2 id={titleId} ref={title} tabIndex={-1}>
          Your cart
        </h2>
        {drawerOpen && (
          <ChunkBoundary>
            <CartPanel />
          </ChunkBoundary>
        )}
        {drawerOpen && lastAdded && <PairsWellWith handle={lastAdded} />}
        <p>
          <Link href="/cart" onClick={() => dialog.current?.close()}>
            View cart
          </Link>
        </p>
        <button type="button" onClick={() => dialog.current?.close()}>
          Close
        </button>
      </dialog>
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </>
  );
}
