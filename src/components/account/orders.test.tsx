// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { OrderDetail } from "@/lib/commerce";
import { OrderDetailView } from "./orders";

afterEach(cleanup);

const usd = (amount: string) => ({ amount, currencyCode: "USD" as const });
const shipment = (
  over: Partial<OrderDetail["fulfillments"][number]>,
): OrderDetail["fulfillments"][number] => ({
  status: "SUCCESS",
  shipmentStatus: null,
  estimatedDeliveryAt: null,
  itemCount: 1,
  tracking: [],
  ...over,
});

const order = (fulfillments: OrderDetail["fulfillments"]) =>
  ({
    id: "gid://shopify/Order/5550002",
    legacyId: "5550002",
    name: "#1002",
    processedAt: "2026-10-01T12:00:00Z",
    financialStatus: "PAID",
    fulfillmentStatus: "PARTIALLY_FULFILLED",
    itemCount: 3,
    total: usd("80.00"),
    lines: [],
    discounts: [],
    shipping: null,
    tax: null,
    subtotal: usd("80.00"),
    fulfillments,
    shippingAddress: null,
    billingAddress: null,
    statusPageUrl: null,
  }) as unknown as OrderDetail;

describe("OrderDetailView shipments", () => {
  it("shows each shipment's status, estimate, items and tracking", () => {
    render(
      <OrderDetailView
        order={order([
          shipment({
            shipmentStatus: "DELIVERED",
            tracking: [
              {
                company: "Synthetic Post",
                number: "SYN123",
                url: "https://tracking.example.test/SYN123",
              },
            ],
          }),
          shipment({
            shipmentStatus: "IN_TRANSIT",
            estimatedDeliveryAt: "2026-10-14T18:00:00Z",
            itemCount: 2,
          }),
        ])}
      />,
    );
    const [first, second] = screen
      .getByRole("list", { name: "Shipments" })
      .querySelectorAll(":scope > li");
    expect(first.textContent).toContain("Shipment 1 of 2: Delivered · 1 item");
    expect(
      within(first as HTMLElement).getByRole("link", {
        name: "Track Synthetic Post SYN123",
      }),
    ).toBeTruthy();
    expect(second.textContent).toMatch(
      /^Shipment 2 of 2: In transit · expected .+ · 2 items$/,
    );
  });

  it("says nothing about shipments before there are any", () => {
    render(<OrderDetailView order={order([])} />);
    expect(screen.queryByRole("list", { name: "Shipments" })).toBeNull();
  });
});
