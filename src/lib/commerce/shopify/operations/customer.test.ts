import { HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import addresses from "../../testing/fixtures/customer/Addresses.json";
import order from "../../testing/fixtures/customer/Order.5550002.json";
import orders from "../../testing/fixtures/customer/Orders.first-page.json";
import { customerAccount, server, TEST_SHOP_ID } from "../../testing/msw";
import { createShopifyRequestContext } from "../request-context";
import {
  appliedDiscounts,
  createAddress,
  fetchAddresses,
  fetchOrder,
  fetchOrders,
} from "./customer";

const call = {
  shopId: TEST_SHOP_ID,
  requestContext: createShopifyRequestContext(
    { country: "US", language: "EN" },
    "https://local.test/account",
  ),
  accessToken: "synthetic-customer-token",
};
const json = (body: unknown) =>
  // A GraphQL body; the resolver types can't infer it from a literal.
  HttpResponse.json(body as { data: Record<string, unknown> }) as never;

describe("Customer Account reads", () => {
  it("pages orders with their number, date, status, total and item count", async () => {
    let variables: Record<string, unknown> | undefined;
    server.use(
      customerAccount.query("Orders", ({ variables: sent }) => {
        variables = sent;
        return json(orders);
      }),
    );
    const page = await fetchOrders(call, { after: "c3ludGhldGljLWVuZA==" });
    expect(variables).toMatchObject({
      first: 10,
      after: "c3ludGhldGljLWVuZA==",
    });
    expect(page.items[0]).toMatchObject({
      name: "#1003",
      legacyId: "5550003",
      itemCount: 1,
      total: { amount: "34.20", currencyCode: "USD" },
    });
    expect(page.nextCursor).toBe("c3ludGhldGljLWVuZA==");
    expect(page.previousCursor).toBeNull();
  });

  it("counts an order's items from its lines, as the live API has no summary", async () => {
    let query = "";
    const first = orders.data.customer.orders.nodes[0];
    server.use(
      customerAccount.query("Orders", ({ query: sent }) => {
        query = sent;
        return json({
          data: {
            customer: {
              orders: {
                ...orders.data.customer.orders,
                nodes: [
                  {
                    ...first,
                    itemQuantities: {
                      nodes: [{ quantity: 2 }, { quantity: 3 }],
                    },
                  },
                ],
              },
            },
          },
        });
      }),
    );
    const page = await fetchOrders(call, {});
    expect(page.items[0]?.itemCount).toBe(5);
    expect(query).toContain("itemQuantities: lineItems(first: 50)");
    expect(query).not.toContain("lineItemsSummary");
  });

  it("reads an order with lines, discounts, shipping, tax and tracking", async () => {
    server.use(customerAccount.query("Order", () => json(order)));
    const detail = await fetchOrder(call, "gid://shopify/Order/5550002");
    expect(
      detail?.lines.map((l) => [l.title, l.variantTitle, l.quantity]),
    ).toEqual([
      ["Synthetic Tee", "Navy / M / Regular", 1],
      ["Synthetic Electrolytes", "Lemon", 1],
    ]);
    expect(detail?.discounts).toEqual([
      { title: "TEST10", amount: { amount: "8.00", currencyCode: "USD" } },
    ]);
    expect(detail?.shipping?.title).toBe("Standard");
    expect(detail?.tax?.amount).toBe("4.00");
    expect(
      detail?.fulfillments.map((f) => [
        f.shipmentStatus,
        f.estimatedDeliveryAt,
        f.itemCount,
        f.tracking.map((t) => t.url),
      ]),
    ).toEqual([
      ["DELIVERED", null, 1, ["https://tracking.example.test/SYN123"]],
      ["IN_TRANSIT", "2026-10-14T18:00:00Z", 2, [null]],
    ]);
    expect(detail?.shippingAddress?.[0]).toBe("Avery Example");
  });

  it("adds up each discount across lines and shipping (the live API has no applied-discounts summary)", () => {
    const usd = (amount: string) => ({ amount, currencyCode: "USD" });
    expect(
      appliedDiscounts([
        {
          allocatedAmount: usd("0.1"),
          discountApplication: { code: "TEST10" },
        },
        {
          allocatedAmount: usd("0.20"),
          discountApplication: { code: "TEST10" },
        },
        {
          allocatedAmount: usd("5.95"),
          discountApplication: { title: "Free shipping" },
        },
        { allocatedAmount: usd("1"), discountApplication: {} },
      ]),
    ).toEqual([
      { title: "TEST10", amount: usd("0.30") },
      { title: "Free shipping", amount: usd("5.95") },
      { title: "Discount", amount: usd("1") },
    ]);
  });

  it("returns null for an order that isn't the customer's", async () => {
    // The API scopes order(id) to the signed-in customer.
    server.use(
      customerAccount.query("Order", () => json({ data: { order: null } })),
    );
    expect(await fetchOrder(call, "gid://shopify/Order/9999999")).toBeNull();
  });

  it("lists addresses with the default first", async () => {
    server.use(customerAccount.query("Addresses", () => json(addresses)));
    const list = await fetchAddresses(call);
    expect(list.map((a) => [a.id, a.isDefault])).toEqual([
      ["gid://shopify/CustomerAddress/702", true],
      ["gid://shopify/CustomerAddress/701", false],
    ]);
  });

  it("sends the access token and the address in Shopify's shape", async () => {
    let auth: string | null = null;
    let sent: Record<string, unknown> | undefined;
    server.use(
      customerAccount.mutation(
        "CustomerAddressCreate",
        ({ request, variables }) => {
          auth = request.headers.get("authorization");
          sent = variables;
          return json({
            data: {
              customerAddressCreate: {
                customerAddress: { id: "gid://shopify/CustomerAddress/703" },
                userErrors: [],
              },
            },
          });
        },
      ),
    );
    const errors = await createAddress(
      call,
      {
        firstName: "Avery",
        lastName: "Example",
        company: "",
        address1: "300 Demo Lane",
        address2: "",
        city: "Springfield",
        zoneCode: "IL",
        countryCode: "US",
        zip: "62701",
        phoneNumber: "",
      },
      true,
    );
    expect(errors).toEqual([]);
    expect(auth).toContain("synthetic-customer-token");
    expect(sent).toMatchObject({
      address: { countryCode: "US", zoneCode: "IL", address1: "300 Demo Lane" },
      defaultAddress: true,
    });
  });
});
