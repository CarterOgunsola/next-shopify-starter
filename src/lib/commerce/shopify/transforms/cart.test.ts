import { describe, expect, it } from "vitest";
import notEnough from "../../testing/fixtures/CartCreate.not-enough-stock.json";
import applied from "../../testing/fixtures/CartDiscountCodesUpdate.applied.json";
import mixed from "../../testing/fixtures/CartCreate.one-time-and-subscription.json";
import soldOut from "../../testing/fixtures/CartCreate.sold-out.json";
import type { CartData } from "../operations/cart";
import { toCart } from "./cart";

type Fixture = {
  data: { cartCreate: { cart: unknown; warnings: { code: string }[] } };
};
const cart = (fixture: Fixture) =>
  toCart(
    fixture.data.cartCreate.cart as CartData,
    fixture.data.cartCreate.warnings,
  );

describe("toCart", () => {
  it("keeps one-time and subscription lines of one variant apart", () => {
    const result = cart(mixed);
    expect(result.totalQuantity).toBe(3);
    expect(result.lines).toHaveLength(2);
    const [subscription, oneTime] = result.lines;
    expect(subscription.merchandise.id).toBe(oneTime.merchandise.id);
    expect(subscription.sellingPlan?.id).toMatch(
      /^gid:\/\/shopify\/SellingPlan\//,
    );
    expect(oneTime.sellingPlan).toBeNull();
    expect(result.checkoutUrl).toMatch(
      /^https:\/\/synthetic-store\.myshopify\.com\//,
    );
    expect(result.warnings).toEqual([]);
  });

  it("drops sold-out lines and explains why", () => {
    const result = cart(soldOut);
    expect(result.lines).toEqual([]);
    expect(result.warnings).toEqual([
      {
        code: "MERCHANDISE_OUT_OF_STOCK",
        message: "An item in your cart is sold out.",
      },
    ]);
  });

  it("reports a reduced quantity in our words", () => {
    const result = cart(notEnough);
    expect(result.lines[0].quantity).toBe(10);
    expect(result.warnings[0].message).toBe(
      "We don't have enough stock, so the quantity was reduced.",
    );
  });

  it("maps line details", () => {
    const [line] = cart(mixed).lines;
    expect(line).toMatchObject({
      merchandise: { product: { handle: "selling-plans-ski-wax" } },
      cost: { totalAmount: { currencyCode: "USD" } },
    });
    expect(line.id).toMatch(/^gid:\/\/shopify\/CartLine\//);
  });
});

describe("order discounts", () => {
  it("are each line's discounts minus its line-level ones, by code", () => {
    const { cart } = applied.data.cartDiscountCodesUpdate;
    const result = toCart(cart as CartData, []);
    // Subtotal 38.00, total 34.20: TEST10 takes 10% off the order.
    expect(result.discounts).toEqual([
      { label: "TEST10", amount: { amount: "3.80", currencyCode: "USD" } },
    ]);
    expect(result.lines[0].discounts).toEqual([]);
  });
});

describe("cart details", () => {
  it("keeps the note, attributes, checkout charge and line parents", () => {
    const result = toCart(mixed.data.cartCreate.cart as CartData, []);
    expect(result.note).toBeNull();
    expect(result.attributes).toEqual([]);
    expect(result.cost.checkoutChargeAmount.currencyCode).toBe("USD");
    expect(result.lines.every((line) => line.parentLineId === null)).toBe(true);
  });
});
