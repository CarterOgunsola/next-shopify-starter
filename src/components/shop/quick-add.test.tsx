// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProductCard, QuickAddProduct, VariantView } from "@/lib/commerce";
import { QuickAdd } from "./quick-add";

vi.mock("@/lib/marketing/actions", () => ({ notifyWhenBackInStock: vi.fn() }));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams("sort=price"),
  usePathname: () => "/collections/test-apparel",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));
const cartAdd = vi.hoisted(() => vi.fn());
vi.mock("@/lib/commerce/cart.client", () => ({
  useCart: () => ({ add: cartAdd }),
}));
const request = vi.hoisted(() => vi.fn());
vi.mock("@/lib/commerce/variant-client", () => ({
  requestVariantView: request,
}));

const usd = (amount: string) => ({ amount, currencyCode: "USD" as const });
const tile = (over: Partial<ProductCard> = {}): ProductCard => ({
  id: "gid://shopify/Product/1",
  handle: "synthetic-tee",
  title: "Synthetic Tee",
  featuredImage: null,
  price: { min: usd("29.0"), max: usd("29.0") },
  available: true,
  trackingParameters: null,
  ...over,
});
const view = (color: string): VariantView => ({
  productId: "gid://shopify/Product/1",
  variant: {
    id: `gid://shopify/ProductVariant/${color}`,
    title: color,
    sku: null,
    selectedOptions: [{ name: "Color", value: color }],
    available: true,
    price: usd("29.0"),
    sellingPlanPrices: [],
  },
  options: [
    {
      name: "Color",
      values: ["Ice", "Dawn"].map((name) => ({
        name,
        selected: name === color,
        exists: true,
        available: true,
      })),
    },
  ],
});
const product: QuickAddProduct = {
  handle: "synthetic-tee",
  title: "Synthetic Tee",
  image: null,
  options: [{ name: "Color", values: [{ name: "Ice" }, { name: "Dawn" }] }],
  sellingPlanGroups: [],
  requiresSellingPlan: false,
  isGiftCard: false,
  prop65: null,
  initialView: view("Ice"),
  backInStock: false,
  marketingOptIn: false,
};

let replaceState: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  // jsdom has no modal dialogs.
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
    this.dispatchEvent(new Event("close"));
  };
  replaceState = vi.spyOn(window.history, "replaceState");
  request.mockImplementation(
    async (_handle: string, selection: Record<string, string>) =>
      view(selection.Color ?? "Ice"),
  );
  cartAdd.mockResolvedValue({ ok: true });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  cartAdd.mockReset();
});

describe("QuickAdd", () => {
  it("adds a product whose only variant needs no choices straight away", async () => {
    render(
      <QuickAdd
        product={tile({ quickAddVariantId: "gid://shopify/ProductVariant/9" })}
      />,
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Add Synthetic Tee to cart" }),
    );
    expect(cartAdd).toHaveBeenCalledWith([
      { merchandiseId: "gid://shopify/ProductVariant/9", quantity: 1 },
    ]);
  });

  it("says why a direct add failed", async () => {
    cartAdd.mockResolvedValue({ ok: false, error: "That item is sold out." });
    render(
      <QuickAdd
        product={tile({ quickAddVariantId: "gid://shopify/ProductVariant/9" })}
      />,
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Add Synthetic Tee to cart" }),
    );
    expect((await screen.findByRole("alert")).textContent).toBe(
      "That item is sold out.",
    );
  });

  it("offers nothing for a sold-out product", () => {
    const { container } = render(
      <QuickAdd product={tile({ available: false })} />,
    );
    expect(container.innerHTML).toBe("");
  });

  it("loads on intent, opens the purchase panel in a dialog and closes after adding", async () => {
    const fetch = vi.fn(async () => Response.json({ product }));
    vi.stubGlobal("fetch", fetch);
    render(<QuickAdd product={tile({ handle: "synthetic-tee-intent" })} />);
    const open = screen.getByRole("button", {
      name: "Quick add Synthetic Tee",
    });
    open.focus();
    expect(fetch).toHaveBeenCalledWith(
      "/api/commerce/quick-add?handle=synthetic-tee-intent",
    );
    await userEvent.click(open);
    expect(fetch).toHaveBeenCalledTimes(1);
    const dialog = screen.getByRole("dialog", { name: "Synthetic Tee" });
    expect(dialog).toHaveProperty("open", true);

    // Choose and add only: no express checkout, a way to the full page.
    await screen.findByRole("radio", { name: "Dawn" });
    expect(
      screen.queryByRole("button", { name: "Buy with Shop Pay" }),
    ).toBeNull();
    expect(
      screen
        .getByRole("link", { name: "View full details" })
        .getAttribute("href"),
    ).toBe("/products/synthetic-tee-intent");

    // Choosing an option stays in the dialog: the listing's URL is left alone.
    await userEvent.click(await screen.findByRole("radio", { name: "Dawn" }));
    expect(replaceState).not.toHaveBeenCalled();
    expect(request).toHaveBeenLastCalledWith(
      "synthetic-tee",
      { Color: "Dawn" },
      null,
      expect.any(AbortSignal),
    );

    await userEvent.click(
      await screen.findByRole("button", { name: "Add to cart" }),
    );
    expect(cartAdd).toHaveBeenCalledWith([
      { merchandiseId: "gid://shopify/ProductVariant/Dawn", quantity: 1 },
    ]);
    expect(dialog).toHaveProperty("open", false);
    expect(screen.queryByRole("button", { name: "Add to cart" })).toBeNull();
  });

  it("shows a Prop 65 warning before the purchase panel", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          product: { ...product, prop65: { chemical: "lead" } },
        }),
      ),
    );
    render(<QuickAdd product={tile({ handle: "synthetic-tee-prop65" })} />);
    await userEvent.click(
      screen.getByRole("button", { name: "Quick add Synthetic Tee" }),
    );
    const warning = await screen.findByRole("region", {
      name: "California Proposition 65 warning",
    });
    expect(warning.textContent).toContain("including lead");
    const panel = screen.getByRole("region", { name: "Purchase" });
    expect(
      warning.compareDocumentPosition(panel) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("says so when the options can't load, and asks again next time", async () => {
    const fetch = vi.fn(async () => new Response(null, { status: 503 }));
    vi.stubGlobal("fetch", fetch);
    render(<QuickAdd product={tile({ handle: "synthetic-tee-down" })} />);
    const open = screen.getByRole("button", {
      name: "Quick add Synthetic Tee",
    });
    await userEvent.click(open);
    expect((await screen.findByRole("alert")).textContent).toBe(
      "This product's options couldn't load.",
    );
    const asked = fetch.mock.calls.length;
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    await userEvent.click(open);
    expect(fetch.mock.calls.length).toBeGreaterThan(asked);
  });
});
