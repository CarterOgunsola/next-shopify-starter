import { HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { handleCheckoutRequest } from "./checkout.server";
import mixed from "./testing/fixtures/CartCreate.one-time-and-subscription.json";
import { replay, server, shopify } from "./testing/msw";

const jar = vi.hoisted(() => ({ value: undefined as string | undefined }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: () => (jar.value ? { value: jar.value } : undefined),
  }),
  headers: async () => new Headers(ip.header ? { "x-real-ip": ip.header } : {}),
}));

const access = vi.hoisted(() => ({
  signedIn: false,
  token: undefined as string | undefined,
  fails: false,
}));
vi.mock("./customer-token.server", () => ({
  customerAccess: async () => {
    if (access.fails) throw new Error("unreadable session");
    return { signedIn: access.signedIn, token: access.token };
  },
}));
const ip = vi.hoisted(() => ({ header: "203.0.113.7" as string | null }));

const on = { shopEnabled: () => true };
const get = (query = "") =>
  new Request(`https://local.test/cart/checkout${query}`);
const cartRead = { data: { cart: mixed.data.cartCreate.cart } };

beforeEach(() => {
  jar.value = undefined;
  access.signedIn = false;
  access.token = undefined;
  access.fails = false;
  ip.header = "203.0.113.7";
  vi.unstubAllEnvs();
});

describe("handleCheckoutRequest", () => {
  it("redirects to Shopify's checkout for the visitor's cart", async () => {
    jar.value = mixed.data.cartCreate.cart.id;
    server.use(replay("Cart", cartRead));
    const response = await handleCheckoutRequest(get(), on);
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      mixed.data.cartCreate.cart.checkoutUrl,
    );
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it("goes to Shop Pay for the same checkout with ?payment=shop_pay", async () => {
    jar.value = mixed.data.cartCreate.cart.id;
    server.use(replay("Cart", cartRead));
    const response = await handleCheckoutRequest(get("?payment=shop_pay"), on);
    const location = new URL(response.headers.get("location")!);
    const plain = new URL(mixed.data.cartCreate.cart.checkoutUrl);
    expect(location.pathname).toBe(plain.pathname);
    expect(location.searchParams.get("key")).toBe(
      plain.searchParams.get("key"),
    );
    expect(location.searchParams.get("payment")).toBe("shop_pay");
  });

  it("sends a visitor without a cart back to the cart page", async () => {
    const response = await handleCheckoutRequest(get(), on);
    expect(response.headers.get("location")).toBe("https://local.test/cart");
  });

  it("attaches a signed-in customer and marks the checkout logged in", async () => {
    jar.value = mixed.data.cartCreate.cart.id;
    access.signedIn = true;
    access.token = "synthetic-customer-token";
    let buyerIdentity: unknown;
    server.use(
      shopify.mutation("CartBuyerIdentityUpdate", ({ variables }) => {
        buyerIdentity = variables.buyerIdentity;
        return HttpResponse.json({
          data: {
            cartBuyerIdentityUpdate: {
              cart: mixed.data.cartCreate.cart,
              userErrors: [],
              warnings: [],
            },
          },
        });
      }),
    );
    const response = await handleCheckoutRequest(get(), on);
    expect(buyerIdentity).toEqual({
      customerAccessToken: "synthetic-customer-token",
    });
    const location = new URL(response.headers.get("location")!);
    expect(location.searchParams.get("logged_in")).toBe("true");
  });

  it("doesn't mark the checkout logged in when attaching the customer fails", async () => {
    jar.value = mixed.data.cartCreate.cart.id;
    access.signedIn = true;
    access.token = "synthetic-customer-token";
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    server.use(
      shopify.mutation("CartBuyerIdentityUpdate", () =>
        HttpResponse.json({
          data: {
            cartBuyerIdentityUpdate: {
              cart: null,
              userErrors: [
                {
                  field: ["buyerIdentity"],
                  message: "Invalid",
                  code: "INVALID",
                },
              ],
              warnings: [],
            },
          },
        }),
      ),
      replay("Cart", cartRead),
    );
    const response = await handleCheckoutRequest(get(), on);
    const location = new URL(response.headers.get("location")!);
    expect(location.host).not.toBe("local.test");
    expect(location.searchParams.has("logged_in")).toBe(false);
    warn.mockRestore();
  });

  it("checks out as a guest when the customer session can't be read", async () => {
    jar.value = mixed.data.cartCreate.cart.id;
    access.fails = true;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    server.use(replay("Cart", cartRead));
    const response = await handleCheckoutRequest(get(), on);
    expect(response.status).toBe(303);
    const location = new URL(response.headers.get("location")!);
    expect(location.searchParams.has("logged_in")).toBe(false);
    expect(location.host).not.toBe("local.test");
    warn.mockRestore();
  });

  it("sends the visitor back to a busy cart without a client IP in production", async () => {
    jar.value = mixed.data.cartCreate.cart.id;
    ip.header = null;
    vi.stubEnv("NODE_ENV", "production");
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await handleCheckoutRequest(get(), on);
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "https://local.test/cart?checkout=busy",
    );
    error.mockRestore();
  });

  it("sends the visitor back to the cart when Shopify refuses the request", async () => {
    jar.value = mixed.data.cartCreate.cart.id;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    server.use(
      shopify.query("Cart", () =>
        HttpResponse.json({
          errors: [
            { message: "Invalid", extensions: { code: "BAD_USER_INPUT" } },
          ],
        }),
      ),
    );
    const response = await handleCheckoutRequest(get(), on);
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "https://local.test/cart?checkout=failed",
    );
    warn.mockRestore();
  });

  it("refreshes an expired customer token once before checkout", async () => {
    access.signedIn = true;
    const first = await handleCheckoutRequest(get(), on);
    const location = new URL(first.headers.get("location")!);
    expect(location.pathname).toBe("/account/refresh");
    const linkCart = new URL(
      location.searchParams.get("return_to")!,
      "https://local.test",
    );
    expect(linkCart.pathname).toBe("/account/link-cart");
    expect(linkCart.searchParams.get("return_to")).toBe(
      "/cart/checkout?refreshed=1",
    );

    // Back from a refresh that didn't help: check out as a guest.
    jar.value = mixed.data.cartCreate.cart.id;
    server.use(replay("Cart", cartRead));
    const again = await handleCheckoutRequest(get("?refreshed=1"), on);
    const checkout = new URL(again.headers.get("location")!);
    expect(checkout.host).not.toBe("local.test");
    expect(checkout.searchParams.has("logged_in")).toBe(false);
    jar.value = undefined;

    // Shop Pay comes back as Shop Pay.
    const shopPay = await handleCheckoutRequest(get("?payment=shop_pay"), on);
    const back = new URL(
      new URL(
        new URL(shopPay.headers.get("location")!).searchParams.get(
          "return_to",
        )!,
        "https://local.test",
      ).searchParams.get("return_to")!,
      "https://local.test",
    );
    expect(back.searchParams.get("payment")).toBe("shop_pay");
    expect(back.searchParams.get("refreshed")).toBe("1");
  });

  it("404s while the shop is off", async () => {
    expect(
      (await handleCheckoutRequest(get(), { shopEnabled: () => false })).status,
    ).toBe(404);
  });
});
