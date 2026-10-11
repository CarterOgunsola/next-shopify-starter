import { HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CART_COOKIE } from "./cart.server";
import {
  applyDiscountCode,
  removeDiscountCode,
  warningFor,
} from "./discount.server";
import codeOnly from "./testing/fixtures/CartCreate.code-only.json";
import applied from "./testing/fixtures/CartDiscountCodesUpdate.applied.json";
import minimum from "./testing/fixtures/CartDiscountCodesUpdate.minimum-not-met.json";
import notFound from "./testing/fixtures/CartDiscountCodesUpdate.not-found.json";
import { server, shopify } from "./testing/msw";

const jar = vi.hoisted(() => ({
  values: new Map<string, string>(),
  set: vi.fn(),
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      jar.values.has(name) ? { value: jar.values.get(name) } : undefined,
    set: (name: string, value: string) => {
      jar.set(name, value);
      jar.values.set(name, value);
    },
    delete: (name: string) => jar.values.delete(name),
  }),
  headers: async () => new Headers({ "x-real-ip": "203.0.113.7" }),
}));

const buyer = { audience: "consumer" } as const;
const existing = applied.data.cartDiscountCodesUpdate.cart;

function withCart() {
  jar.values.set(CART_COOKIE, existing.id);
  server.use(
    shopify.query("Cart", () =>
      HttpResponse.json({ data: { cart: { ...existing, discountCodes: [] } } }),
    ),
  );
}

beforeEach(() => {
  jar.values.clear();
  jar.set.mockClear();
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("applyDiscountCode", () => {
  it("adds the code to the visitor's cart", async () => {
    withCart();
    let codes: unknown;
    server.use(
      shopify.mutation("CartDiscountCodesUpdate", ({ variables }) => {
        codes = variables.discountCodes;
        return HttpResponse.json(applied);
      }),
    );

    const result = await applyDiscountCode("TEST10", buyer);

    expect(codes).toEqual(["TEST10"]);
    expect(result.ok).toBe(true);
    expect(result.cart?.discountCodes).toEqual([
      { code: "TEST10", applicable: true },
    ]);
  });

  it("keeps a code that can apply later and says why it doesn't yet", async () => {
    withCart();
    server.use(
      shopify.mutation("CartDiscountCodesUpdate", () =>
        HttpResponse.json(minimum),
      ),
    );

    const result = await applyDiscountCode("TEST5OFF", buyer);

    expect(result).toMatchObject({
      ok: false,
      error: "Your cart doesn't meet that discount code's minimum yet.",
    });
    expect(result.cart?.discountCodes).toEqual([
      { code: "TEST5OFF", applicable: false },
    ]);
    expect(result.cart?.warnings).toEqual([]);
  });

  it("takes an unknown code back off the cart, after trying it as a gift card", async () => {
    withCart();
    const calls: unknown[] = [];
    const giftTried: unknown[] = [];
    server.use(
      // Shopify answers an unknown gift card code without an error.
      shopify.mutation("CartGiftCardCodesAdd", ({ variables }) => {
        giftTried.push(variables.giftCardCodes);
        return HttpResponse.json({
          data: {
            cartGiftCardCodesAdd: {
              cart: {
                ...notFound.data.cartDiscountCodesUpdate.cart,
                discountCodes: [],
              },
              userErrors: [],
              warnings: [],
            },
          },
        });
      }),
      shopify.mutation("CartDiscountCodesUpdate", ({ variables }) => {
        calls.push(variables.discountCodes);
        return calls.length === 1
          ? HttpResponse.json(notFound)
          : HttpResponse.json({
              data: {
                cartDiscountCodesUpdate: {
                  ...notFound.data.cartDiscountCodesUpdate,
                  cart: {
                    ...notFound.data.cartDiscountCodesUpdate.cart,
                    discountCodes: [],
                  },
                  warnings: [],
                },
              },
            });
      }),
    );

    const result = await applyDiscountCode("NOPE123", buyer);

    expect(calls).toEqual([["NOPE123"], []]);
    expect(giftTried).toEqual([["NOPE123"]]);
    expect(result).toMatchObject({
      ok: false,
      error: "That code isn't a valid discount code or gift card.",
    });
    expect(result.cart?.discountCodes).toEqual([]);
  });

  it("explains that gift cards can't buy gift cards", async () => {
    withCart();
    const base = notFound.data.cartDiscountCodesUpdate.cart;
    // The cart holds a gift card product.
    const cart = {
      ...base,
      discountCodes: [],
      lines: {
        ...base.lines,
        nodes: base.lines.nodes.map((line) => ({
          ...line,
          merchandise: {
            ...line.merchandise,
            product: { ...line.merchandise.product, isGiftCard: true },
          },
        })),
      },
    };
    server.use(
      shopify.mutation("CartDiscountCodesUpdate", ({ variables }) =>
        (variables.discountCodes as string[]).includes("SYNTHETIC0000")
          ? HttpResponse.json(notFound)
          : HttpResponse.json({
              data: {
                cartDiscountCodesUpdate: { cart, userErrors: [], warnings: [] },
              },
            }),
      ),
      // Shopify answers without applying the card, and without a reason.
      shopify.mutation("CartGiftCardCodesAdd", () =>
        HttpResponse.json({
          data: {
            cartGiftCardCodesAdd: { cart, userErrors: [], warnings: [] },
          },
        }),
      ),
    );
    const result = await applyDiscountCode("SYNTHETIC0000", buyer);
    expect(result).toMatchObject({
      ok: false,
      error:
        "Gift cards can't be used to buy gift cards. Remove the gift card from your cart to use this one.",
    });
  });

  it("applies a gift card code given in the same field", async () => {
    withCart();
    const cart = notFound.data.cartDiscountCodesUpdate.cart;
    server.use(
      shopify.mutation("CartDiscountCodesUpdate", ({ variables }) =>
        (variables.discountCodes as string[]).length
          ? HttpResponse.json(notFound)
          : HttpResponse.json({
              data: {
                cartDiscountCodesUpdate: {
                  ...notFound.data.cartDiscountCodesUpdate,
                  cart: { ...cart, discountCodes: [] },
                  warnings: [],
                },
              },
            }),
      ),
      shopify.mutation("CartGiftCardCodesAdd", () =>
        HttpResponse.json({
          data: {
            cartGiftCardCodesAdd: {
              cart: {
                ...cart,
                discountCodes: [],
                appliedGiftCards: [
                  {
                    id: "gid://shopify/AppliedGiftCard/1",
                    lastCharacters: "x7k2",
                    amountUsed: { amount: "25.0", currencyCode: "USD" },
                    balance: { amount: "0.0", currencyCode: "USD" },
                  },
                ],
              },
              userErrors: [],
              warnings: [],
            },
          },
        }),
      ),
    );
    const result = await applyDiscountCode("SYNT HTIC X7K2", buyer);
    expect(result).toMatchObject({ ok: true, applied: "giftCard" });
    expect(result.cart?.giftCards).toEqual([
      {
        id: "gid://shopify/AppliedGiftCard/1",
        lastCharacters: "x7k2",
        amountUsed: { amount: "25.0", currencyCode: "USD" },
        balance: { amount: "0.0", currencyCode: "USD" },
      },
    ]);
  });

  // The code isn't a discount (it's dropped again), then the gift card
  // answer. before: the cards on the cart all along; after: once added.
  type Card = { id: string; lastCharacters: string };
  const giftCardAnswer = (before: Card[], after: Card[]) => {
    const cart = notFound.data.cartDiscountCodesUpdate.cart;
    const cards = (list: Card[]) =>
      list.map((c) => ({
        ...c,
        amountUsed: { amount: "25.0", currencyCode: "USD" },
        balance: { amount: "0.0", currencyCode: "USD" },
      }));
    server.use(
      shopify.query("Cart", () =>
        HttpResponse.json({
          data: {
            cart: {
              ...existing,
              discountCodes: [],
              appliedGiftCards: cards(before),
            },
          },
        }),
      ),
      shopify.mutation("CartDiscountCodesUpdate", ({ variables }) => {
        const codes = variables.discountCodes as string[];
        return HttpResponse.json({
          data: {
            cartDiscountCodesUpdate: {
              ...notFound.data.cartDiscountCodesUpdate,
              cart: {
                ...cart,
                discountCodes: codes.map((code) => ({
                  code,
                  applicable: false,
                })),
                appliedGiftCards: cards(before),
              },
              warnings: codes.length
                ? notFound.data.cartDiscountCodesUpdate.warnings
                : [],
            },
          },
        });
      }),
      shopify.mutation("CartGiftCardCodesAdd", () =>
        HttpResponse.json({
          data: {
            cartGiftCardCodesAdd: {
              cart: {
                ...cart,
                discountCodes: [],
                appliedGiftCards: cards(after),
              },
              userErrors: [],
              warnings: [],
            },
          },
        }),
      ),
    );
  };

  it("doesn't count a new card with another ending as this code's", async () => {
    withCart();
    giftCardAnswer(
      [],
      [{ id: "gid://shopify/AppliedGiftCard/2", lastCharacters: "abcd" }],
    );
    expect(await applyDiscountCode("SYNTHETICX7K2", buyer)).toMatchObject({
      ok: false,
      error: "That code isn't a valid discount code or gift card.",
    });
  });

  it("says when the gift card is already on the cart", async () => {
    withCart();
    const onCart = {
      id: "gid://shopify/AppliedGiftCard/1",
      lastCharacters: "x7k2",
    };
    giftCardAnswer([onCart], [onCart]);
    expect(await applyDiscountCode("SYNTHETICX7K2", buyer)).toMatchObject({
      ok: false,
      error: "That gift card is already on your cart.",
    });
  });

  it("creates a cart for a code that arrives before any item", async () => {
    let input: unknown;
    server.use(
      shopify.mutation("CartCreate", ({ variables }) => {
        input = variables.input;
        return HttpResponse.json(codeOnly);
      }),
    );

    const result = await applyDiscountCode("TEST10", buyer);

    expect(input).toEqual({ lines: [], discountCodes: ["TEST10"] });
    expect(jar.set).toHaveBeenCalledWith(
      CART_COOKIE,
      codeOnly.data.cartCreate.cart.id,
    );
    // Stored, applies once there are items.
    expect(result.ok).toBe(false);
    expect(result.cart?.discountCodes).toEqual([
      { code: "TEST10", applicable: false },
    ]);
  });

  it("doesn't add a code twice, whatever its case", async () => {
    jar.values.set(CART_COOKIE, existing.id);
    server.use(
      shopify.query("Cart", () =>
        HttpResponse.json({ data: { cart: existing } }),
      ),
    );
    let codes: unknown;
    server.use(
      shopify.mutation("CartDiscountCodesUpdate", ({ variables }) => {
        codes = variables.discountCodes;
        return HttpResponse.json(applied);
      }),
    );
    await applyDiscountCode("test10", buyer);
    expect(codes).toEqual(["TEST10"]);
  });
});

describe("removeDiscountCode", () => {
  it("removes the code regardless of case", async () => {
    jar.values.set(CART_COOKIE, existing.id);
    server.use(
      shopify.query("Cart", () =>
        HttpResponse.json({ data: { cart: existing } }),
      ),
    );
    let codes: unknown;
    server.use(
      shopify.mutation("CartDiscountCodesUpdate", ({ variables }) => {
        codes = variables.discountCodes;
        return HttpResponse.json(applied);
      }),
    );
    await removeDiscountCode("test10", buyer);
    expect(codes).toEqual([]);
  });

  it("says the cart expired when there isn't one", async () => {
    expect(await removeDiscountCode("TEST10", buyer)).toMatchObject({
      ok: false,
      error: "Your cart expired. Add the items again.",
    });
  });
});

describe("warningFor", () => {
  const minimum = {
    code: "DISCOUNT_PURCHASE_NOT_IN_RANGE",
    message:
      "The TEST5OFF discount code is not valid for the items in your cart",
  };
  const notFound = {
    code: "DISCOUNT_NOT_FOUND",
    message: "Enter a valid discount code",
  };

  it("finds the warning that names the code", () => {
    expect(warningFor("test5off", [notFound, minimum])).toBe(minimum);
  });

  it("matches the code as a whole word, not inside a longer code", () => {
    const vip20 = {
      code: "DISCOUNT_USAGE_LIMIT_REACHED",
      message: "Discount code VIP20 has reached its limit.",
    };
    const vip = {
      code: "DISCOUNT_PURCHASE_NOT_IN_RANGE",
      message: "Discount code 'vip' needs a larger order.",
    };
    expect(warningFor("VIP", [vip20, vip])).toBe(vip);
    expect(warningFor("vip20", [vip, vip20])).toBe(vip20);
  });

  it("treats 'not found' as about the new code", () => {
    expect(warningFor("NOPE123", [minimum, notFound])).toBe(notFound);
  });

  it("gives up when it can't tell", () => {
    expect(
      warningFor("OTHER", [minimum, { ...minimum, message: "x" }]),
    ).toBeNull();
  });
});
