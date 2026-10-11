import { HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  CART_COOKIE,
  CART_COOKIE_OPTIONS,
  addToCart,
  getCart,
  removeFromCart,
  updateCart,
} from "./cart.server";
import mixed from "./testing/fixtures/CartCreate.one-time-and-subscription.json";
import soldOut from "./testing/fixtures/CartCreate.sold-out.json";
import unknownCart from "./testing/fixtures/CartLinesAdd.unknown-cart.json";
import { server, shopify } from "./testing/msw";
import applied from "./testing/fixtures/CartDiscountCodesUpdate.applied.json";
import { applyDiscountCode, removeDiscountCode } from "./discount.server";
import * as nextServer from "next/server";

const jar = vi.hoisted(() => {
  const values = new Map<string, string>();
  const set = vi.fn((name: string, value: string) => values.set(name, value));
  const del = vi.fn((name: string) => values.delete(name));
  return {
    values,
    set,
    del,
    store: {
      get: (name: string) =>
        values.has(name) ? { name, value: values.get(name)! } : undefined,
      set,
      delete: del,
    },
  };
});

vi.mock("next/headers", () => ({
  cookies: async () => jar.store,
  headers: async () => new Headers({ "x-real-ip": "203.0.113.7" }),
}));

const customer = vi.hoisted(() => ({ token: undefined as string | undefined }));
vi.mock("./customer-token.server", () => ({
  customerAccess: async () => ({
    signedIn: !!customer.token,
    token: customer.token,
  }),
}));

const buyer = { audience: "consumer" } as const;
const created = mixed.data.cartCreate;
const CART_ID = created.cart.id;
const VARIANT = "gid://shopify/ProductVariant/48430713307342";
const asPayload = (key: string) => ({ data: { [key]: created } });

beforeEach(() => {
  jar.values.clear();
  jar.set.mockClear();
  jar.del.mockClear();
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("addToCart", () => {
  it("creates a signed-in customer's cart with them attached", async () => {
    customer.token = "synthetic-customer-token";
    let input: Record<string, unknown> | undefined;
    server.use(
      shopify.mutation("CartCreate", ({ variables }) => {
        input = variables.input as Record<string, unknown>;
        return HttpResponse.json(asPayload("cartCreate"));
      }),
    );
    await addToCart([{ merchandiseId: VARIANT, quantity: 1 }], buyer);
    expect(input?.buyerIdentity).toEqual({
      customerAccessToken: "synthetic-customer-token",
    });
    customer.token = undefined;
  });

  it("fails an add that Shopify accepted without adding anything", async () => {
    // Recorded: a sold-out variant comes back as a warning and a line at
    // quantity 0, without an error.
    server.use(
      shopify.mutation("CartCreate", () => HttpResponse.json(soldOut)),
    );
    const line = soldOut.data.cartCreate.cart.lines.nodes[0];
    const result = await addToCart(
      [{ merchandiseId: line.merchandise.id, quantity: 1 }],
      buyer,
    );
    expect(result).toMatchObject({
      ok: false,
      error: "That item is sold out.",
    });
  });

  it("creates the cart on the first add and sets a locked-down cookie", async () => {
    let ip: string | null = null;
    server.use(
      shopify.mutation("CartCreate", ({ request }) => {
        ip = request.headers.get("Shopify-Storefront-Buyer-IP");
        return HttpResponse.json(asPayload("cartCreate"));
      }),
    );

    const result = await addToCart(
      [{ merchandiseId: VARIANT, quantity: 1 }],
      buyer,
    );

    expect(result.ok).toBe(true);
    expect(jar.set).toHaveBeenCalledWith(
      CART_COOKIE,
      CART_ID,
      CART_COOKIE_OPTIONS,
    );
    expect(CART_COOKIE_OPTIONS).toEqual({
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 1_209_600,
    });
    expect(ip).toBe("203.0.113.7");
  });

  it("adds to the existing cart from the cookie", async () => {
    jar.values.set(CART_COOKIE, CART_ID);
    let cartId: unknown;
    server.use(
      shopify.mutation("CartLinesAdd", ({ variables }) => {
        cartId = variables.cartId;
        return HttpResponse.json(asPayload("cartLinesAdd"));
      }),
    );

    const result = await addToCart(
      [{ merchandiseId: VARIANT, quantity: 1 }],
      buyer,
    );

    expect(result.ok).toBe(true);
    expect(cartId).toBe(CART_ID);
    // Same cart, so no Set-Cookie (that would re-render the page).
    expect(jar.set).not.toHaveBeenCalled();
  });

  it("replaces an expired or completed cart without bothering the visitor", async () => {
    jar.values.set(CART_COOKIE, "gid://shopify/Cart/expired?key=old");
    server.use(
      shopify.mutation("CartLinesAdd", () => HttpResponse.json(unknownCart)),
      shopify.mutation("CartCreate", () =>
        HttpResponse.json(asPayload("cartCreate")),
      ),
    );

    const result = await addToCart(
      [{ merchandiseId: VARIANT, quantity: 1 }],
      buyer,
    );

    expect(result.ok).toBe(true);
    expect(jar.values.get(CART_COOKIE)).toBe(CART_ID);
  });

  it("explains an unavailable item and keeps the cart", async () => {
    jar.values.set(CART_COOKIE, CART_ID);
    server.use(
      shopify.mutation("CartLinesAdd", () =>
        HttpResponse.json({
          data: {
            cartLinesAdd: {
              cart: null,
              userErrors: [
                {
                  code: "INVALID",
                  field: ["lines", "0", "merchandiseId"],
                  message: "x",
                },
              ],
              warnings: [],
            },
          },
        }),
      ),
      shopify.query("Cart", () =>
        HttpResponse.json({ data: { cart: created.cart } }),
      ),
    );

    const result = await addToCart(
      [{ merchandiseId: VARIANT, quantity: 1 }],
      buyer,
    );

    expect(result).toMatchObject({
      ok: false,
      error: "That item isn't available.",
    });
    expect(result.cart?.analyticsId).toBe(CART_ID.split("?")[0]);
  });

  it("asks for a retry when Shopify is throttling", async () => {
    server.use(
      shopify.mutation("CartCreate", () =>
        HttpResponse.json({
          data: null,
          errors: [{ message: "Throttled", extensions: { code: "THROTTLED" } }],
        }),
      ),
    );
    const result = await addToCart(
      [{ merchandiseId: VARIANT, quantity: 1 }],
      buyer,
    );
    expect(result).toMatchObject({
      ok: false,
      error: "The cart is busy right now. Try again in a moment.",
    });
    expect(jar.set).not.toHaveBeenCalled();
  });
});

describe("updateCart and removeFromCart", () => {
  it("update without a cart says it expired", async () => {
    const result = await updateCart(
      [{ id: "gid://shopify/CartLine/a", quantity: 2 }],
      buyer,
    );
    expect(result).toEqual({
      ok: false,
      error: "Your cart expired. Add the items again.",
      cart: null,
    });
  });

  it("clears the cookie when Shopify no longer has the cart", async () => {
    jar.values.set(CART_COOKIE, CART_ID);
    server.use(
      shopify.mutation("CartLinesRemove", () =>
        HttpResponse.json({
          data: { cartLinesRemove: unknownCart.data.cartLinesAdd },
        }),
      ),
    );
    const result = await removeFromCart(["gid://shopify/CartLine/a"], buyer);
    expect(result.ok).toBe(false);
    expect(jar.del).toHaveBeenCalledWith(CART_COOKIE);
  });

  it("updates by line id", async () => {
    jar.values.set(CART_COOKIE, CART_ID);
    let lines: unknown;
    server.use(
      shopify.mutation("CartLinesUpdate", ({ variables }) => {
        lines = variables.lines;
        return HttpResponse.json({ data: { cartLinesUpdate: created } });
      }),
    );
    const result = await updateCart(
      [{ id: "gid://shopify/CartLine/a", quantity: 0 }],
      buyer,
    );
    expect(result.ok).toBe(true);
    expect(lines).toEqual([{ id: "gid://shopify/CartLine/a", quantity: 0 }]);
  });
});

describe("getCart", () => {
  it("reads the cart only at request time, never in a prerender", async () => {
    jar.values.set(CART_COOKIE, CART_ID);
    let asked = 0;
    server.use(
      shopify.query("Cart", () => {
        asked++;
        return HttpResponse.json({ data: { cart: null } });
      }),
    );
    vi.spyOn(nextServer, "connection").mockRejectedValueOnce(
      new Error("prerendering"),
    );
    await expect(getCart(buyer)).rejects.toThrow("prerendering");
    expect(asked).toBe(0);
  });

  it("is null without a cookie and never calls Shopify", async () => {
    expect(await getCart(buyer)).toBeNull();
  });

  it("ignores a cookie that isn't a cart id", async () => {
    jar.values.set(CART_COOKIE, "not-a-cart");
    expect(await getCart(buyer)).toBeNull();
  });

  it("is null when Shopify no longer has the cart", async () => {
    jar.values.set(CART_COOKIE, CART_ID);
    server.use(
      shopify.query("Cart", () => HttpResponse.json({ data: { cart: null } })),
    );
    expect(await getCart(buyer)).toBeNull();
  });
});

describe("what reaches the browser", () => {
  // Action results and the /cart page's props (getCart) end up in the
  // browser. The cart id carries the cart's access key, and so does the
  // checkout URL: neither may be in them.
  const key = new URL(CART_ID.replace("gid://", "https://")).searchParams.get(
    "key",
  )!;
  const leaks = (value: unknown) => {
    const json = JSON.stringify(value);
    return [CART_ID, key, "checkoutUrl", "/cart/c/"].filter((s) =>
      json.includes(s),
    );
  };

  it("never includes the cart id, its key or the checkout URL", async () => {
    expect(key).toBeTruthy();
    jar.values.set(CART_COOKIE, CART_ID);
    server.use(
      shopify.query("Cart", () =>
        HttpResponse.json({ data: { cart: created.cart } }),
      ),
      shopify.mutation("CartLinesAdd", () =>
        HttpResponse.json(asPayload("cartLinesAdd")),
      ),
      shopify.mutation("CartLinesUpdate", () =>
        HttpResponse.json(asPayload("cartLinesUpdate")),
      ),
      shopify.mutation("CartLinesRemove", () =>
        HttpResponse.json(asPayload("cartLinesRemove")),
      ),
      shopify.mutation("CartDiscountCodesUpdate", () =>
        HttpResponse.json(applied),
      ),
    );
    const results = {
      getCart: await getCart(buyer),
      addToCart: await addToCart(
        [{ merchandiseId: VARIANT, quantity: 1 }],
        buyer,
      ),
      updateCart: await updateCart(
        [{ id: "gid://shopify/CartLine/a", quantity: 2 }],
        buyer,
      ),
      removeFromCart: await removeFromCart(["gid://shopify/CartLine/a"], buyer),
      applyDiscountCode: await applyDiscountCode("TEST10", buyer),
      removeDiscountCode: await removeDiscountCode("TEST10", buyer),
    };
    for (const [name, result] of Object.entries(results)) {
      expect(result, name).toBeTruthy();
      expect(leaks(result), name).toEqual([]);
    }
  });
});
