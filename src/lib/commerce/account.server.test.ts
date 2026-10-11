import { HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";
import order from "./testing/fixtures/customer/Order.5550002.json";
import { customerAccount, server } from "./testing/msw";
import { createShopifyRequestContext } from "./shopify/request-context";

const paths = vi.hoisted(() => [] as string[]);
vi.mock("./customer-token.server", () => ({
  pageCustomer: async (path: string) => (
    paths.push(path),
    {
      status: "signed-in",
      shopId: "7",
      call: {
        shopId: "7",
        requestContext: createShopifyRequestContext(
          { country: "US", language: "EN" },
          "https://local.test/account",
        ),
        accessToken: "synthetic-customer-token",
      },
    }
  ),
}));

const { loadOrder, loadOrders } = await import("./account.server");

describe("loadOrder", () => {
  it("shows the customer's own order", async () => {
    server.use(
      customerAccount.query("Order", ({ variables }) =>
        variables.id === "gid://shopify/Order/5550002"
          ? (HttpResponse.json(order) as never)
          : (HttpResponse.json({ data: { order: null } }) as never),
      ),
    );
    const state = await loadOrder("5550002", false);
    expect(state).toMatchObject({
      status: "signed-in",
      data: { name: "#1002" },
    });
  });

  it("has nothing for someone else's order id, so the page 404s", async () => {
    let asked: unknown;
    server.use(
      customerAccount.query("Order", ({ variables }) => {
        asked = variables.id;
        return HttpResponse.json({ data: { order: null } }) as never;
      }),
    );
    const state = await loadOrder("9999999", false);
    // The id from the URL is only used to ask; Shopify decides ownership.
    expect(asked).toBe("gid://shopify/Order/9999999");
    expect(state).toMatchObject({ status: "signed-in", data: null });
  });

  it("doesn't ask Shopify about an id that isn't a number", async () => {
    const state = await loadOrder("../customers", false);
    expect(state).toMatchObject({ data: null });
  });
});

describe("loadOrders", () => {
  it("keeps a cursor intact in its own URL (used to come back after a refresh)", async () => {
    const cursor = "eyJsYXN0X2lkIjo+MTIz/LCJ2IjoxfQ==";
    server.use(
      customerAccount.query(
        "Orders",
        () =>
          HttpResponse.json({
            data: {
              customer: {
                orders: {
                  nodes: [],
                  pageInfo: {
                    hasNextPage: false,
                    hasPreviousPage: true,
                    startCursor: null,
                    endCursor: null,
                  },
                },
              },
            },
          }) as never,
      ),
    );
    await loadOrders({ after: cursor }, false);
    const url = new URL(paths.at(-1)!, "https://local.test");
    expect(url.searchParams.get("after")).toBe(cursor);
  });
});
