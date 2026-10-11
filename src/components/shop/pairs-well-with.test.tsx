// @vitest-environment jsdom
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ProductCard } from "@/lib/commerce";
import { PairsWellWith } from "./pairs-well-with";

const store = vi.hoisted(() => ({
  add: vi.fn(),
  pending: false,
  cart: {
    lines: [{ merchandise: { product: { handle: "test-electrolytes" } } }],
  },
}));
vi.mock("@/lib/commerce/cart.client", () => ({ useCart: () => store }));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  store.add.mockReset();
  store.cart.lines.splice(1);
});

const usd = (amount: string) => ({ amount, currencyCode: "USD" as const });
const card = (handle: string, quickAdd: string | null): ProductCard => ({
  id: `gid://shopify/Product/${handle}`,
  handle,
  title: handle,
  featuredImage: null,
  price: { min: usd("10.0"), max: usd("10.0") },
  available: true,
  trackingParameters: null,
  quickAddVariantId: quickAdd,
});

describe("PairsWellWith in the cart drawer", () => {
  it("shows what goes with the product just added, not what's in the cart", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          products: [
            card("test-electrolytes", null),
            card("the-minimal-snowboard", "gid://shopify/ProductVariant/7"),
            card("test-tee-3-option", null),
          ],
        }),
      ),
    );
    render(<PairsWellWith handle="test-subscription-only" />);
    const list = await screen.findByRole("list", { name: "Pairs well with" });
    expect(fetch).toHaveBeenCalledWith(
      "/api/commerce/recommendations?handle=test-subscription-only",
      expect.anything(),
    );
    const items = within(list).getAllByRole("listitem");
    expect(
      items.map((item) => within(item).getAllByRole("link")[0].textContent),
    ).toEqual(["the-minimal-snowboard", "test-tee-3-option"]);
    // Adding from the list keeps the list (same pairing), minus the item.
    store.add.mockImplementation(async () => {
      store.cart.lines.push({
        merchandise: { product: { handle: "the-minimal-snowboard" } },
      });
      return { ok: true };
    });
    await userEvent.click(
      within(list).getByRole("button", {
        name: "Add the-minimal-snowboard to cart",
      }),
    );
    expect(store.add).toHaveBeenCalledWith(
      [{ merchandiseId: "gid://shopify/ProductVariant/7", quantity: 1 }],
      { keepAnchor: true, quiet: true },
    );
    const next = await screen.findByRole("link", {
      name: "Choose options for test-tee-3-option",
    });
    expect(within(list).getAllByRole("listitem")).toHaveLength(1);
    await waitFor(() => expect(document.activeElement).toBe(next));
    expect(screen.getByText("Added the-minimal-snowboard.")).toBeTruthy();
  });

  it("shows nothing when nothing pairs", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ products: [] })),
    );
    const { container } = render(<PairsWellWith handle="test-electrolytes" />);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(container.textContent).toBe("");
  });

  it("says why an add failed, next to the item, once", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          products: [
            card("the-minimal-snowboard", "gid://shopify/ProductVariant/7"),
          ],
        }),
      ),
    );
    store.add.mockResolvedValue({ ok: false, error: "That item is sold out." });
    render(<PairsWellWith handle="test-subscription-only" />);
    const list = await screen.findByRole("list", { name: "Pairs well with" });
    const add = within(list).getByRole("button", {
      name: "Add the-minimal-snowboard to cart",
    });
    await userEvent.click(add);
    expect(add.getAttribute("aria-describedby")).toBeTruthy();
    expect(
      document.getElementById(add.getAttribute("aria-describedby")!)
        ?.textContent,
    ).toBe("That item is sold out.");
    // The note, and the one live announcement (the store stays quiet).
    expect(screen.getAllByText("That item is sold out.")).toHaveLength(2);
    expect(store.add).toHaveBeenCalledWith(expect.anything(), {
      keepAnchor: true,
      quiet: true,
    });
    expect(document.activeElement).toBe(add);
  });
});
