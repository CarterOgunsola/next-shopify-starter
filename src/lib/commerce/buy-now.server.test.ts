import { HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { handleBuyNowRequest } from "./buy-now.server";
import mixed from "./testing/fixtures/CartCreate.one-time-and-subscription.json";
import { server, shopify } from "./testing/msw";

const jar = vi.hoisted(() => ({
  cart: undefined as string | undefined,
  set: vi.fn(),
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === "store_cart" && jar.cart ? { value: jar.cart } : undefined,
    has: () => false,
    set: jar.set,
  }),
  headers: async () => new Headers({ "x-real-ip": "203.0.113.7" }),
}));
const access = vi.hoisted(() => ({ token: undefined as string | undefined }));
vi.mock("./customer-token.server", () => ({
  customerAccess: async () => ({
    signedIn: !!access.token,
    token: access.token,
  }),
}));

const on = { shopEnabled: () => true };
const post = (fields: Record<string, string>) => {
  const body = new FormData();
  for (const [k, v] of Object.entries(fields)) body.set(k, v);
  return new Request("https://local.test/cart/buy-now", {
    method: "POST",
    body,
  });
};
const VARIANT = "gid://shopify/ProductVariant/48430713307342";
const created = mixed.data.cartCreate;

beforeEach(() => {
  jar.cart = undefined;
  access.token = undefined;
});

describe("POST /cart/buy-now", () => {
  it("checks out just this product with Shop Pay, carrying the visitor's codes and customer", async () => {
    jar.cart = created.cart.id;
    access.token = "synthetic-customer-token";
    let input: Record<string, unknown> | undefined;
    server.use(
      shopify.query("Cart", () =>
        HttpResponse.json({
          data: {
            cart: {
              ...created.cart,
              discountCodes: [{ code: "TEST10", applicable: true }],
            },
          },
        }),
      ),
      shopify.mutation("CartCreate", ({ variables }) => {
        input = variables.input as Record<string, unknown>;
        return HttpResponse.json({ data: { cartCreate: created } });
      }),
    );
    const response = await handleBuyNowRequest(
      post({ variantId: VARIANT, quantity: "2" }),
      on,
    );
    expect(input).toEqual({
      lines: [{ merchandiseId: VARIANT, quantity: 2 }],
      buyerIdentity: { customerAccessToken: "synthetic-customer-token" },
      discountCodes: ["TEST10"],
    });
    expect(response.status).toBe(303);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    const location = new URL(response.headers.get("location")!);
    expect(location.origin).toBe(new URL(created.cart.checkoutUrl).origin);
    expect(location.searchParams.get("payment")).toBe("shop_pay");
    // Hydrogen: no channel unless checkout needs the attribution.
    expect(location.searchParams.has("channel")).toBe(false);
    expect(location.searchParams.get("logged_in")).toBe("true");
  });

  it("doesn't hand off fewer items than asked for", async () => {
    server.use(
      shopify.mutation("CartCreate", () =>
        HttpResponse.json({
          data: {
            cartCreate: {
              ...created,
              cart: { ...created.cart, totalQuantity: 1 },
            },
          },
        }),
      ),
    );
    const response = await handleBuyNowRequest(
      post({ variantId: VARIANT, quantity: "3" }),
      on,
    );
    expect(response.headers.get("location")).toBe(
      "https://local.test/cart?checkout=stock",
    );
  });

  it("leaves the visitor's own cart cookie alone", async () => {
    server.use(
      shopify.mutation("CartCreate", () =>
        HttpResponse.json({ data: { cartCreate: created } }),
      ),
    );
    jar.set.mockClear();
    const response = await handleBuyNowRequest(
      post({ variantId: VARIANT, quantity: "1" }),
      on,
    );
    expect(
      new URL(response.headers.get("location")!).searchParams.get("payment"),
    ).toBe("shop_pay");
    expect(jar.set).not.toHaveBeenCalled();
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it.each([
    [{ variantId: "gid://shopify/Product/1", quantity: "1" }],
    [{ variantId: VARIANT, quantity: "0" }],
    [{ variantId: VARIANT }],
  ])("sends bad input back to the cart: %j", async (fields) => {
    const response = await handleBuyNowRequest(
      post(fields as Record<string, string>),
      on,
    );
    expect(response.headers.get("location")).toBe(
      "https://local.test/cart?checkout=failed",
    );
  });

  it("goes to a busy cart when Shopify can't be reached, and 404s with the shop off", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    server.use(
      shopify.mutation(
        "CartCreate",
        () => new HttpResponse(null, { status: 503 }),
      ),
    );
    const busy = await handleBuyNowRequest(
      post({ variantId: VARIANT, quantity: "1" }),
      on,
    );
    expect(busy.headers.get("location")).toBe(
      "https://local.test/cart?checkout=busy",
    );
    const off = await handleBuyNowRequest(
      post({ variantId: VARIANT, quantity: "1" }),
      {
        shopEnabled: () => false,
      },
    );
    expect(off.status).toBe(404);
  });
});
