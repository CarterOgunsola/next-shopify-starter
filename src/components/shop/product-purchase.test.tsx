// @vitest-environment jsdom
import { BRAND } from "@/lib/brand";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  ProductOption,
  SellingPlanGroup,
  VariantView,
} from "@/lib/commerce";
import { firstPaintView } from "@/lib/commerce/variant-selection";
import { ProductPurchase } from "./product-purchase";

const nav = vi.hoisted(() => ({
  search: "",
  router: { push: vi.fn(), replace: vi.fn() },
}));

const marketing = vi.hoisted(() => ({ notifyWhenBackInStock: vi.fn() }));
vi.mock("@/lib/marketing/actions", () => marketing);
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(nav.search),
  usePathname: () => "/products/synthetic-tee",
  useRouter: () => nav.router,
}));

const cartAdd = vi.hoisted(() => vi.fn());
vi.mock("@/lib/commerce/cart.client", () => ({
  useCart: () => ({ add: cartAdd }),
}));

const request = vi.hoisted(() => vi.fn());
vi.mock("@/lib/commerce/variant-client", () => ({
  requestVariantView: request,
}));

const options: ProductOption[] = [
  { name: "Color", values: [{ name: "Ice" }, { name: "Dawn" }] },
  { name: "Fit", values: [{ name: "Regular" }, { name: "Tall" }] },
];

// Dawn is sold out; Ice / Tall doesn't exist.
function view(color: string, fit = "Regular", available = true): VariantView {
  return {
    productId: "gid://shopify/Product/1",
    variant: {
      id: `gid://shopify/ProductVariant/${color}-${fit}`,
      title: `${color} / ${fit}`,
      sku: null,
      selectedOptions: [
        { name: "Color", value: color },
        { name: "Fit", value: fit },
      ],
      available,
      price: { amount: "29.0", currencyCode: "USD" },
      sellingPlanPrices: [],
    },
    options: [
      {
        name: "Color",
        values: [
          {
            name: "Ice",
            selected: color === "Ice",
            exists: true,
            available: true,
          },
          {
            name: "Dawn",
            selected: color === "Dawn",
            exists: true,
            available: false,
          },
        ],
      },
      {
        name: "Fit",
        values: [
          {
            name: "Regular",
            selected: fit === "Regular",
            exists: true,
            available: true,
          },
          {
            name: "Tall",
            selected: fit === "Tall",
            exists: color !== "Ice",
            available: color !== "Ice",
          },
        ],
      },
    ],
  };
}

let replaceState: ReturnType<typeof vi.spyOn>;

function renderPurchase(
  initialView: VariantView | null = null,
  plans: { groups: SellingPlanGroup[]; required: boolean } = {
    groups: [],
    required: false,
  },
) {
  return render(
    <ProductPurchase
      handle="synthetic-tee"
      options={options}
      sellingPlanGroups={plans.groups}
      requiresSellingPlan={plans.required}
      initialView={initialView}
    />,
  );
}

beforeEach(() => {
  nav.search = "";
  request.mockReset();
  cartAdd.mockReset();
  replaceState = vi.spyOn(window.history, "replaceState");
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  nav.router.push.mockReset();
  nav.router.replace.mockReset();
});

describe("ProductPurchase", () => {
  it("shows live price, stock and sold-out values", async () => {
    request.mockResolvedValue(view("Ice"));
    renderPurchase();

    expect(screen.getByText("Checking price and stock.")).toBeTruthy();
    expect(await screen.findByText("$29.00 · In stock")).toBeTruthy();
    expect(screen.getByRole("radio", { name: "Ice" })).toHaveProperty(
      "checked",
      true,
    );
    expect(screen.getByRole("radio", { name: "Dawn (sold out)" })).toBeTruthy();
    expect(request).toHaveBeenCalledWith(
      "synthetic-tee",
      {},
      null,
      expect.any(AbortSignal),
    );
  });

  it("says how many are left when stock is low", async () => {
    const low = view("Ice");
    request.mockResolvedValue({
      ...low,
      variant: { ...low.variant!, lowStock: 2 },
    });
    renderPurchase();
    expect(await screen.findByText("Only 2 left")).toBeTruthy();
  });

  it("shows the cached default price, without stock, before the live answer", () => {
    request.mockReturnValue(new Promise(() => {}));
    const cached = view("Ice");
    renderPurchase(
      firstPaintView({
        ...cached,
        variant: { ...cached.variant!, lowStock: 2 },
      }),
    );
    expect(screen.getByText("$29.00")).toBeTruthy();
    expect(screen.queryByText(/In stock|Sold out|left/)).toBeNull();
    expect(screen.getByText("Checking price and stock.")).toBeTruthy();
  });

  it("says how many are left only from the live answer", () => {
    request.mockReturnValue(new Promise(() => {}));
    const cached = view("Ice");
    renderPurchase({ ...cached, variant: { ...cached.variant!, lowStock: 2 } });
    expect(screen.queryByText("Only 2 left")).toBeNull();
  });

  it("changes the URL with history.replaceState, never the router", async () => {
    request.mockResolvedValue(view("Ice"));
    renderPurchase();
    await screen.findByText("$29.00 · In stock");

    await userEvent.click(
      screen.getByRole("radio", { name: "Dawn (sold out)" }),
    );

    expect(replaceState).toHaveBeenCalledWith(
      null,
      "",
      "/products/synthetic-tee?color=dawn&fit=regular",
    );
    expect(nav.router.replace).not.toHaveBeenCalled();
    expect(nav.router.push).not.toHaveBeenCalled();
  });

  it("announces the variant only after the visitor picks a value", async () => {
    request.mockResolvedValue(view("Ice"));
    const { container } = renderPurchase();
    await screen.findByText("$29.00 · In stock");
    const live = container.querySelector('p[aria-live="polite"]')!;
    expect(live.textContent).toBe("");

    await userEvent.click(
      screen.getByRole("radio", { name: "Dawn (sold out)" }),
    );
    await waitFor(() => expect(live.textContent).not.toBe(""));
  });

  it("disables the add button with the reason when sold out", async () => {
    nav.search = "color=dawn&fit=regular";
    request.mockResolvedValue(view("Dawn", "Regular", false));
    renderPurchase();

    await screen.findByText("Sold out.");
    const button = screen.getByRole("button", { name: "Add to cart" });
    expect(button).toHaveProperty("disabled", true);
    expect(button.getAttribute("aria-describedby")).toBe(
      screen.getByText("Sold out.").id,
    );
  });

  it("offers Notify me for a sold-out variant when alerts are set up", async () => {
    nav.search = "color=dawn&fit=regular";
    request.mockResolvedValue(view("Dawn", "Regular", false));
    marketing.notifyWhenBackInStock.mockResolvedValue({
      status: "success",
      message: "We'll email you when it's back in stock.",
    });
    render(
      <ProductPurchase
        handle="synthetic-tee"
        options={options}
        sellingPlanGroups={[]}
        requiresSellingPlan={false}
        initialView={null}
        backInStock
        marketingOptIn
      />,
    );
    const form = await screen.findByRole("form", {
      name: "Get an email when Dawn / Regular is back",
    });
    // The marketing choice is separate, starts unticked, names the sender
    // and links the privacy policy.
    expect(
      within(form).getByRole("checkbox", {
        name: new RegExp(
          `Also email me news and offers from ${BRAND.name}\\. Unsubscribe at any time\\.`,
        ),
      }),
    ).toHaveProperty("checked", false);
    expect(
      within(form).getByRole("link", { name: "Privacy policy" }),
    ).toHaveProperty("pathname", "/privacy");
    await userEvent.type(
      within(form).getByLabelText("Email"),
      "avery@example.test",
    );
    await userEvent.click(
      within(form).getByRole("button", { name: "Notify me" }),
    );
    const done = await screen.findByText(
      "We'll email you when it's back in stock.",
    );
    expect(done.getAttribute("role")).toBe("status");
    await waitFor(() => expect(document.activeElement).toBe(done));
    const sent = marketing.notifyWhenBackInStock.mock.calls[0][1] as FormData;
    expect(sent.get("variantId")).toBe(
      "gid://shopify/ProductVariant/Dawn-Regular",
    );
  });

  it("sends a gift card to a recipient, checking their details first", async () => {
    request.mockResolvedValue(view("Ice"));
    cartAdd.mockResolvedValue({ ok: true, cart: null });
    render(
      <ProductPurchase
        handle="synthetic-gift-card"
        options={options}
        sellingPlanGroups={[]}
        requiresSellingPlan={false}
        initialView={null}
        isGiftCard
      />,
    );
    await screen.findByText("$29.00 · In stock");
    await userEvent.click(
      screen.getByRole("checkbox", { name: "Send it to someone by email" }),
    );
    await userEvent.type(screen.getByLabelText("Recipient email"), "sam");
    await userEvent.click(screen.getByRole("button", { name: "Add to cart" }));
    const email = screen.getByLabelText("Recipient email");
    expect(email.getAttribute("aria-invalid")).toBe("true");
    expect(
      screen.getByText("Enter the recipient's email address."),
    ).toBeTruthy();
    await waitFor(() => expect(document.activeElement).toBe(email));
    expect(cartAdd).not.toHaveBeenCalled();

    await userEvent.type(email, "@example.test");
    await userEvent.type(screen.getByLabelText("Message (optional)"), "Enjoy!");
    expect(screen.getByText(/194 characters left/)).toBeTruthy();
    // Send on the last day the picker allows; the buyer's offset goes as
    // Date.getTimezoneOffset() gives it.
    const sendOn = screen.getByLabelText("Send on (optional)");
    const last = sendOn.getAttribute("max")!;
    fireEvent.change(sendOn, { target: { value: last } });
    vi.spyOn(Date.prototype, "getTimezoneOffset").mockReturnValue(300);
    await userEvent.click(screen.getByRole("button", { name: "Add to cart" }));
    expect(cartAdd).toHaveBeenCalledWith([
      expect.objectContaining({
        attributes: [
          { key: "__shopify_send_gift_card_to_recipient", value: "on" },
          { key: "Recipient email", value: "sam@example.test" },
          { key: "Message", value: "Enjoy!" },
          { key: "Send on", value: last },
          { key: "__shopify_offset", value: "300" },
        ],
      }),
    ]);
  });

  it("sends a gift card to the buyer when no recipient is given", async () => {
    request.mockResolvedValue(view("Ice"));
    cartAdd.mockResolvedValue({ ok: true, cart: null });
    render(
      <ProductPurchase
        handle="synthetic-gift-card"
        options={options}
        sellingPlanGroups={[]}
        requiresSellingPlan={false}
        initialView={null}
        isGiftCard
      />,
    );
    await screen.findByText("$29.00 · In stock");
    expect(
      screen.getByText("Otherwise the card is emailed to you."),
    ).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Add to cart" }));
    expect(cartAdd.mock.calls[0][0][0]).not.toHaveProperty("attributes");
  });

  it("offers no Notify me for an available variant, or without alerts", async () => {
    request.mockResolvedValue(view("Ice"));
    render(
      <ProductPurchase
        handle="synthetic-tee"
        options={options}
        sellingPlanGroups={[]}
        requiresSellingPlan={false}
        initialView={null}
        backInStock
      />,
    );
    await screen.findByText("$29.00 · In stock");
    expect(screen.queryByRole("button", { name: "Notify me" })).toBeNull();
    cleanup();
    nav.search = "color=dawn&fit=regular";
    request.mockResolvedValue(view("Dawn", "Regular", false));
    renderPurchase();
    await screen.findByText("Sold out.");
    expect(screen.queryByRole("button", { name: "Notify me" })).toBeNull();
  });

  it("keeps values that don't exist focusable and explains a pick of one", async () => {
    request.mockResolvedValueOnce(view("Ice"));
    const { rerender } = renderPurchase();
    await screen.findByText("$29.00 · In stock");

    const tall = screen.getByRole("radio", { name: "Tall (unavailable)" });
    expect(tall).toHaveProperty("disabled", false);
    expect(tall.getAttribute("aria-disabled")).toBe("true");

    await userEvent.click(tall);
    // Shopify falls back to Ice / Regular for Ice / Tall.
    request.mockResolvedValueOnce(view("Ice"));
    nav.search = "color=ice&fit=tall";
    rerender(
      <ProductPurchase
        handle="synthetic-tee"
        options={options}
        sellingPlanGroups={[]}
        requiresSellingPlan={false}
        initialView={null}
      />,
    );

    expect(
      await screen.findAllByText("This combination isn't available."),
    ).not.toHaveLength(0);
    expect(
      screen.getByRole("radio", { name: "Tall (unavailable)" }),
    ).toHaveProperty("checked", true);
    // The visitor's choice isn't undone.
    expect(replaceState).toHaveBeenCalledTimes(1);
  });

  it("rewrites bad option params on arrival", async () => {
    nav.search = "COLOR=nope&utm_source=email";
    request.mockResolvedValue(view("Ice"));
    renderPurchase();

    await waitFor(() =>
      expect(replaceState).toHaveBeenCalledWith(
        null,
        "",
        "/products/synthetic-tee?utm_source=email&color=ice&fit=regular",
      ),
    );
  });

  it("turns a Shopify ?variant= link into option params", async () => {
    nav.search = "variant=123&utm_source=feed";
    request.mockResolvedValue(view("Dawn", "Regular", false));
    renderPurchase(view("Ice"));

    expect(request).toHaveBeenCalledWith(
      "synthetic-tee",
      {},
      "123",
      expect.any(AbortSignal),
    );
    // The cached default isn't shown for a specific variant link.
    expect(screen.queryByText("$29.00 · In stock")).toBeNull();
    await waitFor(() =>
      expect(replaceState).toHaveBeenCalledWith(
        null,
        "",
        "/products/synthetic-tee?utm_source=feed&color=dawn&fit=regular",
      ),
    );
  });

  it("leaves a URL without option params alone", async () => {
    request.mockResolvedValue(view("Ice"));
    renderPurchase();
    await screen.findByText("$29.00 · In stock");
    expect(replaceState).not.toHaveBeenCalled();
  });

  it("offers a retry when loading fails", async () => {
    request.mockRejectedValueOnce(new Error("503"));
    request.mockResolvedValueOnce(view("Ice"));
    renderPurchase();

    await screen.findByText("Price and stock couldn't load.");
    await act(() =>
      userEvent.click(screen.getByRole("button", { name: "Try again" })),
    );

    expect(document.activeElement).toBe(
      screen.getByRole("region", { name: "Purchase" }),
    );
    expect(await screen.findByText("$29.00 · In stock")).toBeTruthy();
    expect(request).toHaveBeenCalledTimes(2);
  });

  it("moves between values with the arrow keys", async () => {
    request.mockResolvedValue(view("Ice"));
    renderPurchase();
    await screen.findByText("$29.00 · In stock");

    screen.getByRole("radio", { name: "Ice" }).focus();
    await userEvent.keyboard("{ArrowDown}");

    expect(document.activeElement).toBe(
      screen.getByRole("radio", { name: "Dawn (sold out)" }),
    );
    expect(replaceState).toHaveBeenLastCalledWith(
      null,
      "",
      "/products/synthetic-tee?color=dawn&fit=regular",
    );
  });

  it("adds the selected variant and quantity to the cart", async () => {
    request.mockResolvedValue(view("Ice"));
    cartAdd.mockResolvedValue({ ok: true, cart: null });
    renderPurchase();
    await screen.findByText("$29.00 · In stock");

    const quantity = screen.getByLabelText("Quantity");
    await userEvent.clear(quantity);
    await userEvent.type(quantity, "3");
    await userEvent.click(screen.getByRole("button", { name: "Add to cart" }));

    expect(cartAdd).toHaveBeenCalledWith([
      {
        merchandiseId: "gid://shopify/ProductVariant/Ice-Regular",
        quantity: 3,
      },
    ]);
  });

  it("shows why an add failed", async () => {
    request.mockResolvedValue(view("Ice"));
    cartAdd.mockResolvedValue({
      ok: false,
      error: "That item isn't available.",
      cart: null,
    });
    renderPurchase();
    await screen.findByText("$29.00 · In stock");

    await userEvent.click(screen.getByRole("button", { name: "Add to cart" }));

    expect(await screen.findByRole("alert")).toHaveProperty(
      "textContent",
      "That item isn't available.",
    );
  });

  it("offers one-time or Subscribe, with the frequency chosen in a select", async () => {
    const withPlans = view("Ice");
    withPlans.variant!.sellingPlanPrices = [
      {
        planId: "gid://shopify/SellingPlan/1",
        price: { amount: "26.1", currencyCode: "USD" },
        savingsPercent: 10,
      },
      {
        planId: "gid://shopify/SellingPlan/2",
        price: { amount: "27.55", currencyCode: "USD" },
        savingsPercent: 5,
      },
    ];
    request.mockResolvedValue(withPlans);
    cartAdd.mockResolvedValue({ ok: true, cart: null });
    const plan = (n: string, name: string, description: string | null) => ({
      id: `gid://shopify/SellingPlan/${n}`,
      name,
      description,
      recurring: true,
      introOrders: null,
    });
    renderPurchase(null, {
      required: false,
      groups: [
        {
          name: "Subscribe and save",
          plans: [
            plan("1", "Every month", "Skip or cancel any time."),
            plan("2", "Every 2 months", null),
          ],
        },
      ],
    });

    const oneTime = await screen.findByRole("radio", {
      name: /^One-time purchase/,
    });
    expect(oneTime).toHaveProperty("checked", true);
    expect(
      screen.queryByRole("combobox", { name: "Delivery frequency" }),
    ).toBeNull();

    // Shop Pay express is for a one-time purchase only.
    expect(
      screen.getByRole("button", { name: "Buy with Shop Pay" }),
    ).toBeTruthy();
    await userEvent.click(
      screen.getByRole("radio", { name: "Subscribe and save up to 10%" }),
    );
    expect(
      screen.queryByRole("button", { name: "Buy with Shop Pay" }),
    ).toBeNull();
    const frequency = screen.getByRole("combobox", {
      name: "Delivery frequency",
    });
    expect(frequency).toHaveProperty("value", "gid://shopify/SellingPlan/1");
    // Described by the plan's price and terms, then the recurring purchase
    // note with the subscription policy.
    const described = () =>
      frequency
        .getAttribute("aria-describedby")!
        .split(" ")
        .map((id) => document.getElementById(id));
    const [price, terms] = described();
    expect(price?.textContent).toBe(
      "$26.10 a delivery, save 10%. Skip or cancel any time.",
    );
    expect(terms?.textContent).toContain(
      "Recurring purchase: you're charged for each delivery",
    );
    expect(
      within(terms!).getByRole("link", { name: "Subscription policy" }),
    ).toHaveProperty("pathname", "/policies/subscription-policy");

    // A plan without a description of its own gets the general one.
    await userEvent.selectOptions(frequency, "gid://shopify/SellingPlan/2");
    expect(described()[0]?.textContent).toBe(
      "$27.55 a delivery, save 5%. [Placeholder, pending legal review] Delivered and charged on the schedule you choose.",
    );
    await userEvent.click(screen.getByRole("button", { name: "Add to cart" }));
    expect(cartAdd).toHaveBeenCalledWith([
      expect.objectContaining({ sellingPlanId: "gid://shopify/SellingPlan/2" }),
    ]);
  });

  it("starts a subscription-only product on its first plan, with no one-time option", async () => {
    const withPlans = view("Ice");
    withPlans.variant!.sellingPlanPrices = [
      {
        planId: "gid://shopify/SellingPlan/1",
        price: { amount: "26.1", currencyCode: "USD" },
      },
      {
        planId: "gid://shopify/SellingPlan/2",
        price: { amount: "26.1", currencyCode: "USD" },
      },
    ];
    request.mockResolvedValue(withPlans);
    cartAdd.mockResolvedValue({ ok: true, cart: null });
    renderPurchase(null, {
      required: true,
      groups: [
        {
          name: "Subscribe",
          plans: [
            {
              id: "gid://shopify/SellingPlan/1",
              name: "Every month",
              description: null,
              recurring: true,
              introOrders: null,
            },
            {
              id: "gid://shopify/SellingPlan/2",
              name: "Every 2 months",
              description: null,
              recurring: true,
              introOrders: null,
            },
          ],
        },
      ],
    });

    expect(
      await screen.findByRole("radio", { name: "Subscribe" }),
    ).toHaveProperty("checked", true);
    expect(
      screen.getByRole("combobox", { name: "Delivery frequency" }),
    ).toHaveProperty("value", "gid://shopify/SellingPlan/1");
    expect(screen.queryByText(/One-time purchase/)).toBeNull();
    // It leads with the plan price, says so, and offers no one-time price.
    expect(
      screen.getByText(/^\$26\.10 · Every month · In stock$/),
    ).toBeTruthy();
    expect(
      screen.getByText(
        /Subscription only: this product isn't sold as a one-time/,
      ),
    ).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Add to cart" }));
    expect(cartAdd).toHaveBeenCalledWith([
      expect.objectContaining({ sellingPlanId: "gid://shopify/SellingPlan/1" }),
    ]);
  });
});
