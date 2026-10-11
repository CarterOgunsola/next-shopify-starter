"use client";

import {
  createContext,
  startTransition,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useOptimistic,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import {
  addCartLines,
  applyCartDiscountCode,
  removeCartDiscountCode,
  removeCartGiftCard,
  removeCartLines,
  updateCartLines,
} from "./cart.actions";
import { cartConfirmed } from "./analytics.client";
import { CART_ERRORS } from "./cart-messages";
import { cartCountLabel, withQuantity } from "./cart-view";
import type { Cart, CartLineInput, CartResult } from "./types";

// Cart state for the header button, drawer, cart page and add button.
// Changes go through the cart server actions; quantity changes show at once
// and checkout waits until Shopify has confirmed them.

export const CART_ENDPOINT = "/api/commerce/cart";

export type CartStore = {
  cart: Cart | null;
  // False until the visitor's cart has been read.
  loaded: boolean;
  // A change is on its way; checkout waits for it.
  pending: boolean;
  error: string | null;
  // For the aria-live region.
  announcement: string;
  drawerOpen: boolean;
  // keepAnchor: an add from the drawer's own "Pairs well with", which keeps
  // pairing with the product it was showing.
  // quiet: the caller announces the result (the drawer's Pairs well with).
  add(
    lines: CartLineInput[],
    options?: { keepAnchor?: boolean; quiet?: boolean },
  ): Promise<CartResult>;
  setQuantity(lineId: string, quantity: number): void;
  // A selling plan for the line, or null for a one-time purchase.
  setPlan(lineId: string, planId: string | null): void;
  remove(lineId: string): void;
  applyCode(code: string): void;
  removeCode(code: string): void;
  removeGiftCard(id: string): void;
  // The product last added, for the drawer's "Pairs well with".
  lastAdded: string | null;
  openDrawer(): void;
  closeDrawer(): void;
};

const closedStore: CartStore = {
  cart: null,
  loaded: true,
  pending: false,
  error: null,
  announcement: "",
  drawerOpen: false,
  add: async () => ({ ok: false, error: CART_ERRORS.closed, cart: null }),
  setQuantity() {},
  setPlan() {},
  remove() {},
  applyCode() {},
  removeCode() {},
  removeGiftCard() {},
  lastAdded: null,
  openDrawer() {},
  closeDrawer() {},
};

const CartContext = createContext<CartStore>(closedStore);

export function useCart(): CartStore {
  return useContext(CartContext);
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [cart, setCart] = useState<Cart | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [lastAdded, setLastAdded] = useState<string | null>(null);
  const [pending, startCartTransition] = useTransition();
  const [shownCart, showQuantity] = useOptimistic(
    cart,
    (current: Cart | null, change: { lineId: string; quantity: number }) =>
      current && withQuantity(current, change),
  );
  // Bumped by every change, so a slow initial read can't overwrite it.
  const version = useRef(0);
  // The last cart Shopify confirmed, for analytics deltas. undefined until
  // the visitor's cart has been read.
  const confirmed = useRef<Cart | null | undefined>(undefined);
  // An expired cart (null) isn't the visitor removing items: analytics
  // only resets its baseline.
  const confirm = useCallback((next: Cart | null) => {
    cartConfirmed(confirmed.current, next);
    confirmed.current = next;
  }, []);

  // Reads the visitor's cart from the server: on load, and again when the
  // page comes back from the back-forward cache (say, back from checkout,
  // where the cart may have been completed).
  useEffect(() => {
    let controller = new AbortController();
    const read = () => {
      const started = version.current;
      const signal = controller.signal;
      fetch(CART_ENDPOINT, { signal })
        .then((response) => (response.ok ? response.json() : { cart: null }))
        .then((body: { cart: Cart | null }) => {
          if (version.current !== started) return;
          setCart(body.cart);
          confirm(body.cart);
        })
        .catch(() => {})
        .finally(() => {
          if (!signal.aborted) setLoaded(true);
        });
    };
    const restored = (event: PageTransitionEvent) => {
      if (!event.persisted) return;
      // The cart may have changed elsewhere (completed at checkout, edited
      // in another tab): the re-read is a new analytics baseline, not
      // additions or removals.
      confirmed.current = undefined;
      controller.abort();
      controller = new AbortController();
      read();
    };
    read();
    window.addEventListener("pageshow", restored);
    return () => {
      controller.abort();
      window.removeEventListener("pageshow", restored);
    };
  }, [confirm]);

  // A server action that throws (network down, server error) settles as a
  // failed change on the last cart Shopify confirmed, so nothing stays stuck
  // and the page keeps working.
  const attempt = useCallback(
    async (action: () => Promise<CartResult>): Promise<CartResult> => {
      try {
        return await action();
      } catch {
        return {
          ok: false,
          error: CART_ERRORS.failed,
          cart: confirmed.current ?? null,
        };
      }
    },
    [],
  );

  // quiet: the caller announces the result itself (one announcement).
  const settle = useCallback(
    (result: CartResult, success: string, quiet = false) => {
      version.current++;
      confirm(result.cart);
      startTransition(() => {
        setCart(result.cart);
        setLoaded(true);
        setError(result.ok ? null : result.error);
        const warnings = result.cart?.warnings.map((w) => w.message) ?? [];
        if (!quiet) {
          setAnnouncement(
            [result.ok ? success : result.error, ...warnings].join(" "),
          );
        }
      });
    },
    [confirm],
  );

  const add = useCallback(
    (
      lines: CartLineInput[],
      options?: { keepAnchor?: boolean; quiet?: boolean },
    ) =>
      new Promise<CartResult>((resolve) => {
        startCartTransition(async () => {
          const result = await attempt(() => addCartLines(lines));
          settle(result, "Added to cart.", options?.quiet);
          if (result.ok) {
            const added = result.cart.lines.find(
              (line) => line.merchandise.id === lines[0]?.merchandiseId,
            );
            startTransition(() => {
              setDrawerOpen(true);
              if (!options?.keepAnchor) {
                setLastAdded(added?.merchandise.product.handle ?? null);
              }
            });
          }
          resolve(result);
        });
      }),
    [attempt, settle],
  );

  const change = useCallback(
    (lineId: string, quantity: number) => {
      startCartTransition(async () => {
        showQuantity({ lineId, quantity });
        const result = await attempt(() =>
          quantity > 0
            ? updateCartLines([{ id: lineId, quantity }])
            : removeCartLines([lineId]),
        );
        settle(
          result,
          quantity > 0
            ? `Quantity updated. Cart has ${cartCountLabel(result.cart?.totalQuantity ?? 0)}.`
            : "Removed from cart.",
        );
      });
    },
    [attempt, settle, showQuantity],
  );

  const plan = useCallback(
    (lineId: string, sellingPlanId: string | null) => {
      startCartTransition(async () => {
        // The plan only: the line keeps whatever quantity Shopify has.
        const result = await attempt(() =>
          updateCartLines([{ id: lineId, sellingPlanId }]),
        );
        settle(
          result,
          sellingPlanId
            ? "Delivery plan updated."
            : "Changed to a one-time purchase.",
        );
      });
    },
    [attempt, settle],
  );

  const codes = useCallback(
    (code: string, apply: boolean) => {
      startCartTransition(async () => {
        const result = await attempt(() =>
          apply ? applyCartDiscountCode(code) : removeCartDiscountCode(code),
        );
        settle(
          result,
          apply
            ? result.ok && result.applied === "giftCard"
              ? "Gift card applied."
              : `Discount code ${code} applied.`
            : `Discount code ${code} removed.`,
        );
      });
    },
    [attempt, settle],
  );

  const giftCard = useCallback(
    (id: string) => {
      startCartTransition(async () => {
        const result = await attempt(() => removeCartGiftCard(id));
        settle(result, "Gift card removed.");
      });
    },
    [attempt, settle],
  );

  const store = useMemo<CartStore>(
    () => ({
      cart: shownCart,
      loaded,
      pending,
      error,
      announcement,
      drawerOpen,
      add,
      setQuantity: change,
      setPlan: plan,
      remove: (lineId) => change(lineId, 0),
      applyCode: (code) => codes(code, true),
      removeCode: (code) => codes(code, false),
      removeGiftCard: giftCard,
      lastAdded,
      openDrawer: () => setDrawerOpen(true),
      closeDrawer: () => setDrawerOpen(false),
    }),
    [
      shownCart,
      loaded,
      pending,
      error,
      announcement,
      drawerOpen,
      add,
      change,
      plan,
      codes,
      giftCard,
      lastAdded,
    ],
  );

  return <CartContext.Provider value={store}>{children}</CartContext.Provider>;
}
