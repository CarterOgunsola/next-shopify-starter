// @vitest-environment jsdom
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CartProvider, useCart, type CartStore } from "./cart.client";
import type { Cart } from "./types";

const analytics = vi.hoisted(() => ({ cartConfirmed: vi.fn() }));
vi.mock("./analytics.client", () => analytics);
const actions = vi.hoisted(() => ({ addCartLines: vi.fn() }));
vi.mock("./cart.actions", () => actions);

const cart = (id: string): Cart =>
  ({
    analyticsId: id,
    lines: [],
    totalQuantity: 0,
    warnings: [],
  }) as unknown as Cart;

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  analytics.cartConfirmed.mockClear();
});

describe("CartProvider after a back-forward cache restore", () => {
  it("re-reads the cart as a new analytics baseline", async () => {
    const reads = [cart("before-checkout"), cart("after-checkout")];
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ cart: reads.shift() ?? null })),
    );
    render(
      <CartProvider>
        <p>page</p>
      </CartProvider>,
    );
    await vi.waitFor(() =>
      expect(analytics.cartConfirmed).toHaveBeenCalledTimes(1),
    );
    await act(async () => {
      window.dispatchEvent(
        new PageTransitionEvent("pageshow", { persisted: true }),
      );
    });
    await vi.waitFor(() =>
      expect(analytics.cartConfirmed).toHaveBeenCalledTimes(2),
    );
    // Both reads are baselines (no previous cart), so nothing is reported
    // as added or removed.
    expect(analytics.cartConfirmed.mock.calls).toEqual([
      [undefined, expect.objectContaining({ analyticsId: "before-checkout" })],
      [undefined, expect.objectContaining({ analyticsId: "after-checkout" })],
    ]);
  });
});

describe("the product Pairs well with is anchored to", () => {
  it("is the one added from the page, not one added from the list", async () => {
    const withLine = (handle: string, variant: string) =>
      ({
        analyticsId: "c",
        totalQuantity: 1,
        warnings: [],
        lines: [{ merchandise: { id: variant, product: { handle } } }],
      }) as unknown as Cart;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ cart: null })),
    );
    let store: CartStore | undefined;
    function Probe() {
      store = useCart();
      return null;
    }
    render(
      <CartProvider>
        <Probe />
      </CartProvider>,
    );
    actions.addCartLines.mockResolvedValueOnce({
      ok: true,
      cart: withLine("test-electrolytes", "gid://shopify/ProductVariant/1"),
    });
    await act(async () => {
      await store!.add([
        { merchandiseId: "gid://shopify/ProductVariant/1", quantity: 1 },
      ]);
    });
    expect(store!.lastAdded).toBe("test-electrolytes");
    actions.addCartLines.mockResolvedValueOnce({
      ok: true,
      cart: withLine("the-minimal-snowboard", "gid://shopify/ProductVariant/7"),
    });
    await act(async () => {
      await store!.add(
        [{ merchandiseId: "gid://shopify/ProductVariant/7", quantity: 1 }],
        { keepAnchor: true },
      );
    });
    expect(store!.lastAdded).toBe("test-electrolytes");
  });
});
