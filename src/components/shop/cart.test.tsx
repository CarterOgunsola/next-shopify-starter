// @vitest-environment jsdom
import {
  act,
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Cart, CartResult } from "@/lib/commerce";
import { CartProvider, useCart } from "@/lib/commerce/cart.client";
import { CartButton } from "./cart-button";
import { CartContents } from "./cart-contents";
import { CartDrawer } from "./cart-drawer";
import { CartPanel } from "./cart-panel";

const actions = vi.hoisted(() => ({
  addCartLines: vi.fn(),
  updateCartLines: vi.fn(),
  removeCartLines: vi.fn(),
  applyCartDiscountCode: vi.fn(),
  removeCartDiscountCode: vi.fn(),
  removeCartGiftCard: vi.fn(),
}));
vi.mock("@/lib/commerce/cart.actions", () => actions);

const money = (amount: string) => ({ amount, currencyCode: "USD" });

function cart(quantity: number, total = "20.0"): Cart {
  return {
    analyticsId: "gid://shopify/Cart/synthetic",
    updatedAt: "2026-10-07T12:00:00Z",
    totalQuantity: quantity,
    lines: quantity
      ? [
          {
            id: "gid://shopify/CartLine/a",
            quantity,
            attributes: [],
            parentLineId: null,
            planOptions: [],
            requiresSellingPlan: false,
            isGiftCard: false,
            merchandise: {
              id: "gid://shopify/ProductVariant/1",
              title: "Lemon",
              sku: null,
              product: {
                id: "gid://shopify/Product/1",
                handle: "synthetic-electrolytes",
                title: "Synthetic Electrolytes",
                vendor: "Synthetic Vendor",
                productType: "Supplement",
              },
              image: null,
              selectedOptions: [{ name: "Flavor", value: "Lemon" }],
            },
            sellingPlan: null,
            discounts: [{ label: "TEST10", amount: money("2.0") }],
            cost: {
              amountPerQuantity: money("10.0"),
              compareAtAmountPerQuantity: null,
              totalAmount: money(total),
            },
          },
        ]
      : [],
    cost: {
      subtotalAmount: money(total),
      totalAmount: money(total),
      checkoutChargeAmount: money(total),
    },
    note: null,
    attributes: [],
    discounts: [],
    discountCodes: [],
    giftCards: [],
    warnings: [],
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

function renderCart(initial: Cart | null) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({ cart: initial })),
  );
  return render(
    <CartProvider>
      <CartButton />
      <CartPanel />
      <CartDrawer />
    </CartProvider>,
  );
}

beforeEach(() => {
  // jsdom has no modal dialogs.
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("cart", () => {
  it("loads the visitor's cart into the header button", async () => {
    renderCart(cart(2));
    expect(
      await screen.findByRole("button", { name: "Cart, 2 items" }),
    ).toBeTruthy();
  });

  it("reads the cart again when the page returns from the back-forward cache", async () => {
    const reads = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ cart: cart(2) }))
      .mockResolvedValueOnce(Response.json({ cart: null }));
    vi.stubGlobal("fetch", reads);
    render(
      <CartProvider>
        <CartButton />
      </CartProvider>,
    );
    await screen.findByRole("button", { name: "Cart, 2 items" });

    // A normal pageshow is the first load: no second read.
    act(() => {
      window.dispatchEvent(
        Object.assign(new Event("pageshow"), { persisted: false }),
      );
    });
    expect(reads).toHaveBeenCalledTimes(1);

    // Back from checkout, where the cart was completed.
    act(() => {
      window.dispatchEvent(
        Object.assign(new Event("pageshow"), { persisted: true }),
      );
    });
    expect(
      await screen.findByRole("button", { name: "Cart, 0 items" }),
    ).toBeTruthy();
    expect(reads).toHaveBeenCalledTimes(2);
  });

  it("shows an empty cart with a way back to the shop", async () => {
    renderCart(null);
    expect(await screen.findByText(/Your cart is empty/)).toBeTruthy();
    expect(
      screen
        .getByRole("link", { name: "Browse the shop" })
        .getAttribute("href"),
    ).toBe("/shop");
  });

  it("subscribes a line from the cart, then changes its frequency", async () => {
    const plans = [
      {
        id: "gid://shopify/SellingPlan/1",
        name: "Every month",
        price: money("9.0"),
        recurring: true,
        saves: true,
        prepaid: false,
      },
      {
        id: "gid://shopify/SellingPlan/2",
        name: "Every 2 months",
        price: money("9.5"),
        recurring: true,
        saves: true,
        prepaid: false,
      },
    ];
    const withPlans = (planId: string | null, requires = false): Cart => {
      const base = cart(2);
      return {
        ...base,
        lines: base.lines.map((line) => ({
          ...line,
          planOptions: plans,
          requiresSellingPlan: requires,
          sellingPlan: planId
            ? { id: planId, name: plans.find((p) => p.id === planId)!.name }
            : null,
        })),
      };
    };
    renderCart(withPlans(null));
    await screen.findByRole("button", { name: "Cart, 2 items" });
    const [toggle] = screen.getAllByRole("checkbox", {
      name: "Subscribe and save on Synthetic Electrolytes",
    });
    expect(toggle).toHaveProperty("checked", false);
    expect(
      screen.queryByRole("combobox", { name: /Delivery frequency/ }),
    ).toBeNull();

    actions.updateCartLines.mockResolvedValueOnce({
      ok: true,
      cart: withPlans("gid://shopify/SellingPlan/1"),
    });
    await userEvent.click(toggle);
    expect(actions.updateCartLines).toHaveBeenLastCalledWith([
      {
        id: "gid://shopify/CartLine/a",
        sellingPlanId: "gid://shopify/SellingPlan/1",
      },
    ]);
    const [frequency] = await screen.findAllByRole("combobox", {
      name: "Delivery frequency for Synthetic Electrolytes",
    });
    expect(
      within(frequency)
        .getAllByRole("option")
        .map((o) => o.textContent),
    ).toEqual([
      "Every month ($9.00 each a delivery)",
      "Every 2 months ($9.50 each a delivery)",
    ]);

    actions.updateCartLines.mockResolvedValueOnce({
      ok: true,
      cart: withPlans("gid://shopify/SellingPlan/2"),
    });
    await userEvent.selectOptions(frequency, "gid://shopify/SellingPlan/2");
    expect(actions.updateCartLines).toHaveBeenLastCalledWith([
      {
        id: "gid://shopify/CartLine/a",
        sellingPlanId: "gid://shopify/SellingPlan/2",
      },
    ]);
    expect(
      await screen.findAllByText("Delivery plan updated."),
    ).not.toHaveLength(0);

    // Unsubscribing goes back to a one-time purchase.
    actions.updateCartLines.mockResolvedValueOnce({
      ok: true,
      cart: withPlans(null),
    });
    await userEvent.click(
      screen.getAllByRole("checkbox", {
        name: "Subscribe and save on Synthetic Electrolytes",
      })[0],
    );
    expect(actions.updateCartLines).toHaveBeenLastCalledWith([
      // The plan only: never a quantity that may be out of date.
      { id: "gid://shopify/CartLine/a", sellingPlanId: null },
    ]);
  });

  it("only changes the frequency of a plan-only line", async () => {
    const base = cart(1);
    renderCart({
      ...base,
      lines: base.lines.map((line) => ({
        ...line,
        requiresSellingPlan: true,
        planOptions: [
          {
            id: "gid://shopify/SellingPlan/1",
            name: "Every month",
            price: money("9.0"),
            recurring: true,
            saves: true,
            prepaid: false,
          },
        ],
        sellingPlan: { id: "gid://shopify/SellingPlan/1", name: "Every month" },
      })),
    });
    await screen.findAllByRole("combobox", {
      name: "Delivery frequency for Synthetic Electrolytes",
    });
    expect(
      screen.queryByRole("checkbox", { name: /Subscribe and save/ }),
    ).toBeNull();
  });

  it("shows gift cards on the cart, with what's used and left, and removes one", async () => {
    const base = cart(1);
    const withCard: Cart = {
      ...base,
      lines: base.lines.map((line) => ({
        ...line,
        attributes: [
          { key: "__shopify_send_gift_card_to_recipient", value: "on" },
          { key: "Recipient email", value: "sam@example.test" },
        ],
      })),
      giftCards: [
        {
          id: "gid://shopify/AppliedGiftCard/1",
          lastCharacters: "x7k2",
          amountUsed: money("10.0"),
          balance: money("15.0"),
        },
      ],
    };
    renderCart(withCard);
    const [cards] = await screen.findAllByRole("list", {
      name: "Gift cards on your cart",
    });
    expect(cards.textContent).toContain(
      "Gift card ending X7K2: $10.00 used on this order, $15.00 left on the card",
    );
    // The recipient shows on the line; Shopify's own flag doesn't.
    const [details] = screen.getAllByLabelText(
      "Details for Synthetic Electrolytes",
    );
    expect(details.textContent).toBe("Recipient emailsam@example.test");

    actions.removeCartGiftCard.mockResolvedValue({
      ok: true,
      cart: { ...withCard, giftCards: [] },
    });
    await userEvent.click(
      within(cards).getByRole("button", {
        name: "Remove gift card ending X7K2",
      }),
    );
    expect(actions.removeCartGiftCard).toHaveBeenCalledWith(
      "gid://shopify/AppliedGiftCard/1",
    );
    expect(await screen.findAllByText("Gift card removed.")).not.toHaveLength(
      0,
    );
  });

  it("shows each gift card in the summary when they cover the order", async () => {
    const base = cart(1, "72.0");
    renderCart({
      ...base,
      cost: {
        subtotalAmount: money("72.0"),
        totalAmount: money("0.0"),
        checkoutChargeAmount: money("72.0"),
      },
      giftCards: [
        {
          id: "gid://shopify/AppliedGiftCard/1",
          lastCharacters: "0000",
          amountUsed: money("50.0"),
          balance: money("0.0"),
        },
        {
          id: "gid://shopify/AppliedGiftCard/2",
          lastCharacters: "2222",
          amountUsed: money("22.0"),
          balance: money("478.0"),
        },
      ],
    });
    const subtotal = (await screen.findAllByText("Subtotal"))[0];
    const rows = [...subtotal.closest("dl")!.querySelectorAll("dt")].map(
      (dt) => [dt.textContent, dt.nextElementSibling?.textContent],
    );
    expect(rows).toEqual([
      ["Subtotal", "$72.00"],
      ["Gift card ending 0000", "−$50.00"],
      ["Gift card ending 2222", "−$22.00"],
      ["Total", "$0.00"],
    ]);
  });

  it("says a gift card was applied when the code was one", async () => {
    renderCart(cart(1));
    await screen.findByRole("button", { name: "Cart, 1 item" });
    actions.applyCartDiscountCode.mockResolvedValue({
      ok: true,
      applied: "giftCard",
      cart: cart(1),
    });
    const [input] = screen.getAllByLabelText("Discount code or gift card code");
    await userEvent.type(input, "SYNTHETICX7K2");
    await userEvent.click(screen.getAllByRole("button", { name: "Apply" })[0]);
    expect(await screen.findAllByText("Gift card applied.")).not.toHaveLength(
      0,
    );
  });

  it("shows a quantity change at once and holds checkout until Shopify confirms", async () => {
    renderCart(cart(2));
    await screen.findByRole("button", { name: "Cart, 2 items" });
    const pending = deferred<CartResult>();
    actions.updateCartLines.mockReturnValue(pending.promise);

    await userEvent.click(
      screen.getByRole("button", {
        name: "Increase quantity of Synthetic Electrolytes",
      }),
    );

    expect(screen.getByRole("button", { name: "Cart, 3 items" })).toBeTruthy();
    expect(
      screen
        .getByRole("link", { name: "Check out" })
        .getAttribute("aria-disabled"),
    ).toBe("true");
    expect(screen.getByText("Updating your cart.")).toBeTruthy();
    expect(actions.updateCartLines).toHaveBeenCalledWith([
      { id: "gid://shopify/CartLine/a", quantity: 3 },
    ]);

    await act(async () => pending.resolve({ ok: true, cart: cart(3, "30.0") }));

    expect(
      screen
        .getByRole("link", { name: "Check out" })
        .hasAttribute("aria-disabled"),
    ).toBe(false);
    expect(screen.getByText("Line total after discounts: $30.00")).toBeTruthy();
    expect(
      screen.getByText("Quantity updated. Cart has 3 items."),
    ).toBeTruthy();
  });

  it("puts the quantity back and explains when a change fails", async () => {
    renderCart(cart(2));
    await screen.findByRole("button", { name: "Cart, 2 items" });
    actions.updateCartLines.mockResolvedValue({
      ok: false,
      error: "Your cart couldn't be updated. Try again.",
      cart: cart(2),
    });

    await userEvent.click(
      screen.getByRole("button", {
        name: "Increase quantity of Synthetic Electrolytes",
      }),
    );

    expect(await screen.findByRole("alert")).toHaveProperty(
      "textContent",
      "Your cart couldn't be updated. Try again.",
    );
    expect(screen.getByRole("button", { name: "Cart, 2 items" })).toBeTruthy();
  });

  it("settles a change that throws as failed, keeping the confirmed cart", async () => {
    renderCart(cart(2));
    await screen.findByRole("button", { name: "Cart, 2 items" });
    actions.updateCartLines.mockRejectedValue(new Error("network down"));

    await userEvent.click(
      screen.getByRole("button", {
        name: "Increase quantity of Synthetic Electrolytes",
      }),
    );

    expect(await screen.findByRole("alert")).toHaveProperty(
      "textContent",
      "Your cart couldn't be updated. Try again.",
    );
    expect(screen.getByRole("button", { name: "Cart, 2 items" })).toBeTruthy();
    expect(
      screen
        .getByRole("link", { name: "Check out" })
        .hasAttribute("aria-disabled"),
    ).toBe(false);
  });

  it("resolves an add that throws as failed, so the add button recovers", async () => {
    actions.addCartLines.mockRejectedValue(new Error("network down"));
    let result: CartResult | undefined;
    function AddButton() {
      const { add } = useCart();
      return (
        <button
          type="button"
          onClick={async () => {
            result = await add([
              { merchandiseId: "gid://shopify/ProductVariant/1", quantity: 1 },
            ]);
          }}
        >
          Add
        </button>
      );
    }
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ cart: null })),
    );
    render(
      <CartProvider>
        <AddButton />
      </CartProvider>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Add" }));
    await waitFor(() => expect(result).toBeDefined());
    expect(result).toEqual({
      ok: false,
      error: "Your cart couldn't be updated. Try again.",
      cart: null,
    });
  });

  it("steps quantities by the variant's quantity rule", async () => {
    const base = cart(6);
    const ruled = {
      ...base,
      lines: [
        {
          ...base.lines[0],
          merchandise: {
            ...base.lines[0].merchandise,
            quantityRule: { min: 6, max: 24, increment: 6 },
          },
        },
      ],
    };
    renderCart(ruled);
    await screen.findByRole("button", { name: "Cart, 6 items" });
    actions.updateCartLines.mockResolvedValue({ ok: true, cart: ruled });

    expect(
      screen.getByRole("button", {
        name: "Decrease quantity of Synthetic Electrolytes",
      }),
    ).toHaveProperty("disabled", true);
    await userEvent.click(
      screen.getByRole("button", {
        name: "Increase quantity of Synthetic Electrolytes",
      }),
    );
    expect(actions.updateCartLines).toHaveBeenLastCalledWith([
      { id: "gid://shopify/CartLine/a", quantity: 12 },
    ]);

    const input = screen.getByRole("spinbutton", {
      name: "Quantity for Synthetic Electrolytes",
    });
    await userEvent.clear(input);
    await userEvent.type(input, "13{Enter}");
    expect(actions.updateCartLines).toHaveBeenLastCalledWith([
      { id: "gid://shopify/CartLine/a", quantity: 12 },
    ]);
  });

  it("links each line to its variant, with a decorative image", async () => {
    const base = cart(1);
    renderCart({
      ...base,
      lines: [
        {
          ...base.lines[0],
          merchandise: {
            ...base.lines[0].merchandise,
            image: {
              url: "https://cdn.shopify.com/s/files/x.jpg",
              altText: "Lemon tub",
              width: 100,
              height: 100,
            },
          },
        },
      ],
    });
    const links = await screen.findAllByRole("link", {
      name: "Synthetic Electrolytes",
    });
    expect(links[0].getAttribute("href")).toBe(
      "/products/synthetic-electrolytes?variant=1",
    );
    expect(screen.queryByRole("img", { name: "Lemon tub" })).toBeNull();
  });

  it("keeps a code that wasn't applied, and shows applied codes in capitals", async () => {
    renderCart(cart(2));
    await screen.findByRole("button", { name: "Cart, 2 items" });
    actions.applyCartDiscountCode.mockResolvedValue({
      ok: false,
      error: "That discount code isn't valid.",
      cart: cart(2),
    });
    const [input] = screen.getAllByLabelText("Discount code or gift card code");
    await userEvent.type(input, "tst10");
    await userEvent.click(screen.getAllByRole("button", { name: "Apply" })[0]);
    await screen.findByRole("alert");
    expect(input).toHaveProperty("value", "tst10");

    actions.applyCartDiscountCode.mockResolvedValue({
      ok: true,
      cart: {
        ...cart(2),
        discountCodes: [{ code: "test10", applicable: true }],
      },
    });
    await userEvent.clear(input);
    await userEvent.type(input, "test10");
    await userEvent.click(screen.getAllByRole("button", { name: "Apply" })[0]);
    expect(await screen.findByText(/TEST10 \(applied\)/)).toBeTruthy();
    expect(input).toHaveProperty("value", "");
  });

  it("starts the cart dialog on its heading", async () => {
    renderCart(cart(1));
    await userEvent.click(
      await screen.findByRole("button", { name: "Cart, 1 item" }),
    );
    expect(document.activeElement).toBe(
      screen.getByRole("heading", { name: "Your cart" }),
    );
  });

  it("removes a line", async () => {
    renderCart(cart(2));
    await screen.findByRole("button", { name: "Cart, 2 items" });
    actions.removeCartLines.mockResolvedValue({ ok: true, cart: cart(0) });

    await userEvent.click(
      screen.getByRole("button", { name: "Remove Synthetic Electrolytes" }),
    );

    expect(actions.removeCartLines).toHaveBeenCalledWith([
      "gid://shopify/CartLine/a",
    ]);
    expect(
      (await screen.findAllByText(/Your cart is empty/)).length,
    ).toBeGreaterThan(0);
    expect(screen.getByText("Removed from cart.")).toBeTruthy();
  });

  it("applies a typed quantity on Enter, not per keystroke", async () => {
    renderCart(cart(2));
    await screen.findByRole("button", { name: "Cart, 2 items" });
    actions.updateCartLines.mockResolvedValue({
      ok: true,
      cart: cart(12, "120.0"),
    });

    const input = screen.getByRole("spinbutton", {
      name: "Quantity for Synthetic Electrolytes",
    });
    await userEvent.clear(input);
    await userEvent.type(input, "12");
    expect(actions.updateCartLines).not.toHaveBeenCalled();
    await userEvent.keyboard("{Enter}");

    expect(actions.updateCartLines).toHaveBeenCalledWith([
      { id: "gid://shopify/CartLine/a", quantity: 12 },
    ]);
  });

  it("shows discounts and Shopify's totals", async () => {
    renderCart(cart(2));
    expect(await screen.findByText("TEST10: −$2.00")).toBeTruthy();
    expect(screen.getByText("Line total after discounts: $20.00")).toBeTruthy();
    expect(screen.getAllByText("$20.00").length).toBe(2);
  });

  it("shows what's due today when a subscription bills later", async () => {
    renderCart({
      ...cart(1, "40.0"),
      cost: {
        subtotalAmount: money("40.0"),
        totalAmount: money("40.0"),
        checkoutChargeAmount: money("0.0"),
      },
    });
    const due = await screen.findByText("Due today, before discounts");
    expect(due.nextElementSibling?.textContent).toBe("$0.00");
  });

  it("hides Due today when nothing bills later, even with a discount", async () => {
    renderCart({
      ...cart(1, "38.0"),
      cost: {
        subtotalAmount: money("38.0"),
        totalAmount: money("34.2"),
        checkoutChargeAmount: money("38.0"),
      },
    });
    await screen.findByRole("button", { name: "Cart, 1 item" });
    expect(screen.queryByText(/Due today/)).toBeNull();
  });

  it("shows order discounts between the subtotal and the total", async () => {
    renderCart({
      ...cart(2, "114.0"),
      cost: {
        subtotalAmount: money("114.0"),
        totalAmount: money("102.6"),
        // Before discounts, as Shopify reports it.
        checkoutChargeAmount: money("114.0"),
      },
      discounts: [{ label: "TEST10", amount: money("11.4") }],
    });
    const discount = await screen.findByText("Discount (TEST10)");
    // The summary rows in order: label, value.
    const rows = [...discount.closest("dl")!.querySelectorAll("dt")].map(
      (term) => [term.textContent, term.nextElementSibling?.textContent],
    );
    const labels = rows.map(([label]) => label);
    expect(labels.indexOf("Subtotal")).toBe(
      labels.indexOf("Discount (TEST10)") - 1,
    );
    expect(labels.indexOf("Discount (TEST10)")).toBeLessThan(
      labels.findIndex((label) => /^(Estimated )?[Tt]otal/.test(label ?? "")),
    );
    expect(rows).toContainEqual(["Subtotal", "$114.00"]);
    expect(rows).toContainEqual(["Discount (TEST10)", "−$11.40"]);
    expect(
      rows.find(
        ([label]) => /total/i.test(label ?? "") && label !== "Subtotal",
      )?.[1],
    ).toBe("$102.60");
  });

  it("opens the drawer from the header button", async () => {
    renderCart(cart(1));
    await userEvent.click(
      await screen.findByRole("button", { name: "Cart, 1 item" }),
    );
    const dialog = screen.getByRole("dialog", { name: "Your cart" });
    expect(
      within(dialog).getByRole("link", { name: "View cart" }),
    ).toBeTruthy();
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Close" }),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("checks out through a plain link the server redirects", async () => {
    renderCart(cart(1));
    const link = await screen.findByRole("link", { name: "Check out" });
    expect(link.getAttribute("href")).toBe("/cart/checkout");
  });

  it("offers Shop Pay express, but not for plans or gift cards", async () => {
    renderCart(cart(1));
    const shopPay = await screen.findAllByRole("link", {
      name: "Check out with Shop Pay",
    });
    expect(shopPay[0].getAttribute("href")).toBe(
      "/cart/checkout?payment=shop_pay",
    );
    cleanup();
    const base = cart(1);
    renderCart({
      ...base,
      lines: base.lines.map((line) => ({
        ...line,
        sellingPlan: { id: "gid://shopify/SellingPlan/1", name: "Every month" },
      })),
    });
    await screen.findByRole("button", { name: "Cart, 1 item" });
    expect(
      screen.queryByRole("link", { name: "Check out with Shop Pay" }),
    ).toBeNull();
  });

  it("applies a discount code and lists it", async () => {
    renderCart(cart(2));
    await screen.findByRole("button", { name: "Cart, 2 items" });
    const withCode = {
      ...cart(2, "18.0"),
      discountCodes: [{ code: "TEST10", applicable: true }],
    };
    actions.applyCartDiscountCode.mockResolvedValue({
      ok: true,
      cart: withCode,
    });

    await userEvent.type(
      screen.getByLabelText("Discount code or gift card code"),
      " TEST10 ",
    );
    await userEvent.click(screen.getByRole("button", { name: "Apply" }));

    expect(actions.applyCartDiscountCode).toHaveBeenCalledWith("TEST10");
    expect(await screen.findByText(/TEST10 \(applied\)/)).toBeTruthy();
    expect(screen.getByText("Discount code TEST10 applied.")).toBeTruthy();
    expect(
      screen.getByLabelText("Discount code or gift card code"),
    ).toHaveProperty("value", "");
  });

  it("says why a code isn't applied", async () => {
    renderCart(cart(2));
    await screen.findByRole("button", { name: "Cart, 2 items" });
    actions.applyCartDiscountCode.mockResolvedValue({
      ok: false,
      error: "Your cart doesn't meet that discount code's minimum yet.",
      cart: {
        ...cart(2),
        discountCodes: [{ code: "TEST5OFF", applicable: false }],
      },
    });

    await userEvent.type(
      screen.getByLabelText("Discount code or gift card code"),
      "TEST5OFF",
    );
    await userEvent.click(screen.getByRole("button", { name: "Apply" }));

    expect(await screen.findByRole("alert")).toHaveProperty(
      "textContent",
      "Your cart doesn't meet that discount code's minimum yet.",
    );
    expect(
      screen.getByText(/TEST5OFF \(not applied to your cart yet\)/),
    ).toBeTruthy();
  });

  it("removes a discount code", async () => {
    renderCart({
      ...cart(2),
      discountCodes: [{ code: "TEST10", applicable: true }],
    });
    actions.removeCartDiscountCode.mockResolvedValue({
      ok: true,
      cart: cart(2),
    });
    await userEvent.click(
      await screen.findByRole("button", {
        name: "Remove discount code TEST10",
      }),
    );
    expect(actions.removeCartDiscountCode).toHaveBeenCalledWith("TEST10");
  });
});

describe("free shipping progress", () => {
  const props = {
    pending: false,
    error: null,
    onQuantity() {},
    onPlan() {},
    onRemove() {},
    onApplyCode() {},
    onRemoveCode() {},
  };

  it("shows what's left to spend", () => {
    render(
      <CartContents
        {...props}
        cart={cart(2, "38.0")}
        freeShippingThreshold="50.00"
      />,
    );
    expect(
      screen.getByText("Spend $12.00 more for free shipping."),
    ).toBeTruthy();
    expect(
      screen
        .getByRole("progressbar", { name: "Progress to free shipping" })
        .getAttribute("value"),
    ).toBe("76");
  });

  it("confirms when the order qualifies", () => {
    render(
      <CartContents
        {...props}
        cart={cart(2, "60.0")}
        freeShippingThreshold="50.00"
      />,
    );
    expect(screen.getByText("Your order ships free.")).toBeTruthy();
  });

  it("is hidden without a configured threshold", () => {
    render(<CartContents {...props} cart={cart(2)} />);
    expect(screen.queryByRole("progressbar")).toBeNull();
  });
});
