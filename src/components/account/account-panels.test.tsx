// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { OrderSummary } from "@/lib/commerce";
import {
  AccountGate,
  AccountNav,
  OrderList,
  SignInPanel,
} from "./account-panels";

afterEach(cleanup);

const order: OrderSummary = {
  id: "gid://shopify/Order/5550002",
  legacyId: "5550002",
  name: "#1002",
  processedAt: "2026-09-20T12:00:00Z",
  financialStatus: "PAID",
  fulfillmentStatus: "FULFILLED",
  total: { amount: "76.0", currencyCode: "USD" },
  itemCount: 2,
  statusPageUrl: "https://shopify.com/7/account/orders/5550002?key=synthetic",
};

describe("account panels", () => {
  it("links an order to its page on this site", () => {
    render(<OrderList orders={[order]} />);
    expect(
      screen.getByRole("link", { name: "#1002" }).getAttribute("href"),
    ).toBe("/account/orders/5550002");
  });

  it("lists the account pages, and one link to Shopify for the rest", () => {
    render(<AccountNav manageUrl="https://shopify.com/7/account" />);
    const nav = screen.getByRole("navigation", { name: "Account" });
    expect(
      within(nav)
        .getAllByRole("link")
        .map((link) => [link.textContent, link.getAttribute("href")]),
    ).toEqual([
      ["Overview", "/account"],
      ["Orders", "/account/orders"],
      ["Profile", "/account/profile"],
      ["Addresses", "/account/addresses"],
      ["Manage on Shopify", "https://shopify.com/7/account"],
    ]);
    expect(
      within(nav).getByRole("link", {
        name: "Manage on Shopify",
        description: "Subscriptions, returns and payment methods.",
      }),
    ).toBeTruthy();
    // A note under the link, not run on after it.
    expect(within(nav).getByText(/^Subscriptions/).tagName).toBe("P");
  });

  it("says the session ended, with a way back to the page", () => {
    render(
      <AccountGate status="signed-out" ended returnTo="/account/profile" />,
    );
    expect(screen.getByRole("alert").textContent).toBe(
      "Your session ended. Sign in again to continue.",
    );
    // Back to the page after sign-in, through linking the cart.
    expect(
      screen.getByRole("link", { name: "Sign in" }).getAttribute("href"),
    ).toBe(
      `/account/login?return_to=${encodeURIComponent(
        `/account/link-cart?return_to=${encodeURIComponent("/account/profile")}`,
      )}`,
    );
  });

  it("explains when sign-in can't start", () => {
    render(<SignInPanel failed={false} unavailable />);
    expect(screen.getByRole("alert").textContent).toBe(
      "Sign-in isn't available right now. Try again in a few minutes.",
    );
  });

  it("comes back to the page sign-in started from", () => {
    const href = () =>
      screen.getByRole("link", { name: "Sign in" }).getAttribute("href");
    const back = (path: string) =>
      `/account/login?return_to=${encodeURIComponent(
        `/account/link-cart?return_to=${encodeURIComponent(path)}`,
      )}`;
    render(<SignInPanel failed={false} />);
    expect(href()).toBe(back("/account"));
    cleanup();
    render(<AccountGate status="signed-out" returnTo="/account/orders" />);
    expect(href()).toBe(back("/account/orders"));
  });
});
