import { HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { handleCartRequest } from "./cart-endpoint.server";
import mixed from "./testing/fixtures/CartCreate.one-time-and-subscription.json";
import { server, shopify } from "./testing/msw";

const jar = vi.hoisted(() => ({ value: undefined as string | undefined }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: () => (jar.value ? { value: jar.value } : undefined),
  }),
  headers: async () => new Headers({ "x-real-ip": "203.0.113.7" }),
}));

const on = { shopEnabled: () => true };

beforeEach(() => {
  jar.value = undefined;
});

describe("handleCartRequest", () => {
  it("returns no cart without a cookie, without calling Shopify", async () => {
    const response = await handleCartRequest(on);
    expect(await response.json()).toEqual({ cart: null });
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  });

  it("returns the visitor's cart", async () => {
    jar.value = mixed.data.cartCreate.cart.id;
    server.use(
      shopify.query("Cart", () =>
        HttpResponse.json({ data: { cart: mixed.data.cartCreate.cart } }),
      ),
    );
    const response = await handleCartRequest(on);
    const text = await response.text();
    expect(JSON.parse(text).cart.totalQuantity).toBe(3);
    // The id's access key and the checkout URL stay on the server.
    expect(text).not.toContain("?key=");
    expect(text).not.toContain("checkoutUrl");
    expect(text).not.toContain("/cart/c/");
    expect(JSON.parse(text).cart.analyticsId).toBe(
      mixed.data.cartCreate.cart.id.split("?")[0],
    );
  });

  it("drops the cookie when Shopify no longer has the cart", async () => {
    jar.value = mixed.data.cartCreate.cart.id;
    server.use(
      shopify.query("Cart", () => HttpResponse.json({ data: { cart: null } })),
    );
    const response = await handleCartRequest(on);
    expect(await response.json()).toEqual({ cart: null });
    expect(response.headers.get("set-cookie")).toContain("store_cart=;");
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
  });

  it("leaves cookies alone for a visitor without a cart", async () => {
    const response = await handleCartRequest(on);
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("404s while the shop is off", async () => {
    expect((await handleCartRequest({ shopEnabled: () => false })).status).toBe(
      404,
    );
  });
});
