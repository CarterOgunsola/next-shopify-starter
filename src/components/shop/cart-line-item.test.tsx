// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CartLine } from "@/lib/commerce";
import { skiWaxCart } from "@/lib/commerce/testing/factories";
import { CartLineItem } from "./cart-line-item";

afterEach(cleanup);

// The recorded ski wax lines (one on its weekly plan), as one-time lines.
const lines = skiWaxCart().lines.map((line) => ({
  ...line,
  sellingPlan: null,
}));
const WEEKLY = "gid://shopify/SellingPlan/3291644110";
const PREPAID = "gid://shopify/SellingPlan/3291676878";

function renderLine(line: CartLine, onPlan = vi.fn()) {
  render(
    <CartLineItem
      line={line}
      disabled={false}
      onQuantity={() => {}}
      onPlan={onPlan}
      onRemove={() => {}}
    />,
  );
  return onPlan;
}

describe("a cart line's plans", () => {
  it("prices plans per delivery, with a prepaid plan's charge today", () => {
    const prepaid: CartLine = {
      ...lines[1],
      sellingPlan: { id: PREPAID, name: "Prepaid" },
      cost: {
        ...lines[1].cost,
        amountPerQuantity: { amount: "239.52", currencyCode: "USD" },
      },
    };
    renderLine(prepaid);
    expect(
      within(screen.getByRole("combobox", { name: /Delivery frequency/ }))
        .getAllByRole("option")
        .map((o) => o.textContent),
    ).toEqual([
      "Ski wax subscription, billed and delivered weekly ($21.21 each a delivery)",
      "A year supply of prepaid ski wax, delivered monthly ($19.96 each a delivery)",
    ]);
    expect(
      screen.getByText(
        /\$19\.96 each a delivery, \$239\.52 each charged today/,
      ),
    ).toBeTruthy();
  });

  it("prices an introductory plan per delivery, not as prepaid", () => {
    const intro: CartLine = {
      ...lines[1],
      sellingPlan: { id: WEEKLY, name: "Intro" },
      planOptions: lines[1].planOptions.map((plan) =>
        plan.id === WEEKLY ? { ...plan, prepaid: false } : plan,
      ),
      // The first orders' price, below the ongoing one.
      cost: {
        ...lines[1].cost,
        amountPerQuantity: { amount: "12.48", currencyCode: "USD" },
      },
    };
    renderLine(intro);
    expect(screen.getByText("$12.48 each a delivery")).toBeTruthy();
    expect(screen.queryByText(/charged today/)).toBeNull();
  });

  it("says save only when the subscription it switches to saves", () => {
    renderLine({
      ...lines[0],
      planOptions: lines[0].planOptions.map((p) => ({ ...p, saves: false })),
    });
    expect(
      screen.getByRole("checkbox", { name: /^Subscribe on / }).parentElement
        ?.textContent,
    ).toBe(" Subscribe");
  });

  it("subscribes to a recurring plan that saves, whatever comes first", async () => {
    const options = lines[0].planOptions;
    const line: CartLine = {
      ...lines[0],
      planOptions: [
        { ...options[0], id: "once", recurring: false },
        { ...options[0], id: "no-saving", saves: false },
        ...options,
      ],
    };
    const onPlan = renderLine(line);
    await userEvent.click(
      screen.getByRole("checkbox", { name: /Subscribe and save on/ }),
    );
    expect(onPlan).toHaveBeenCalledWith(WEEKLY);
  });

  it("offers no Subscribe and save without a subscription", () => {
    renderLine({
      ...lines[0],
      planOptions: lines[0].planOptions.map((p) => ({
        ...p,
        recurring: false,
      })),
    });
    expect(
      screen.queryByRole("checkbox", { name: /Subscribe and save/ }),
    ).toBeNull();
  });
});
