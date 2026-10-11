import { describe, expect, it } from "vitest";
import {
  createStore,
  SYNTHETIC_GIFT_CARD,
} from "../../../../e2e/support/synthetic-store.mjs";
import codeOnly from "./fixtures/CartCreate.code-only.json";
import notEnough from "./fixtures/CartCreate.not-enough-stock.json";
import planRequired from "./fixtures/CartCreate.plan-required.json";
import giftCard from "./fixtures/CartGiftCardCodesAdd.applied.json";
import giftCardAgain from "./fixtures/CartGiftCardCodesAdd.already-applied.json";
import minimumNotMet from "./fixtures/CartDiscountCodesUpdate.minimum-not-met.json";
import notFound from "./fixtures/CartDiscountCodesUpdate.not-found.json";
import soldOut from "./fixtures/CartCreate.sold-out.json";
import outOfStock from "./fixtures/ProductContent.the-out-of-stock-snowboard.json";
import tee from "./fixtures/ProductContent.test-tee-3-option.json";
import unknownCart from "./fixtures/CartLinesAdd.unknown-cart.json";
import creatine from "./fixtures/ProductContent.test-subscription-only.json";
import wax from "./fixtures/ProductContent.selling-plans-ski-wax.json";

// The end-to-end tests' synthetic store answers as the dev store did in
// the recordings.

type Payload = {
  cart: {
    id: string;
    totalQuantity: number;
    lines: { nodes: { quantity: number }[] };
    discountCodes: { code: string; applicable: boolean }[];
    appliedGiftCards: { amountUsed: { amount: string } }[];
    cost: { totalAmount: { amount: string } };
  } | null;
  userErrors: { code: string; field: string[] }[];
  warnings: { code: string; message: string }[];
};
const call = (
  store: ReturnType<typeof createStore>,
  operation: string,
  variables: Record<string, unknown>,
) => {
  const body = store.respond({ query: `mutation ${operation}`, variables }) as {
    data: Record<string, Payload>;
  };
  return Object.values(body.data)[0];
};
const WAX = wax.data.product.selectedOrFirstAvailableVariant.id;
const CREATINE = creatine.data.product.selectedOrFirstAvailableVariant.id;
const lines = (merchandiseId: string, quantity = 1) => ({
  input: { lines: [{ merchandiseId, quantity }] },
});

describe("the synthetic store", () => {
  it("refuses a plan-only product without a plan", () => {
    const recorded = planRequired.data.cartCreate;
    const answer = call(createStore(), "CartCreate", lines(CREATINE));
    expect(answer.cart).toBeNull();
    expect(
      answer.userErrors.map(({ code, field }) => ({ code, field })),
    ).toEqual(recorded.userErrors.map(({ code, field }) => ({ code, field })));
  });

  it("adds up to the stock, with the warning", () => {
    const recorded = notEnough.data.cartCreate;
    const answer = call(createStore(), "CartCreate", lines(WAX, 100000));
    expect(answer.warnings).toEqual(recorded.warnings);
    expect(answer.cart?.totalQuantity).toBe(recorded.cart.totalQuantity);
  });

  it("doesn't honour a code on an empty cart, and matches codes in any case", () => {
    const store = createStore();
    const recorded = codeOnly.data.cartCreate;
    const empty = call(store, "CartCreate", {
      input: { discountCodes: ["TEST10"] },
    });
    expect(empty.cart?.discountCodes).toEqual(recorded.cart.discountCodes);
    expect(empty.warnings).toEqual(recorded.warnings);

    const cart = call(store, "CartCreate", lines(WAX)).cart!;
    const lower = call(store, "CartDiscountCodesUpdate", {
      cartId: cart.id,
      discountCodes: ["test10"],
    });
    expect(lower.cart?.discountCodes).toEqual([
      { code: "test10", applicable: true },
    ]);
  });

  it("answers an unknown cart with the error and a new cart", () => {
    const recorded = unknownCart.data.cartLinesAdd;
    const answer = call(createStore(), "CartLinesAdd", {
      cartId: "gid://shopify/Cart/unknown?key=x",
      lines: [{ merchandiseId: WAX, quantity: 1 }],
    });
    expect(answer.userErrors).toEqual(recorded.userErrors);
    expect(answer.cart?.totalQuantity).toBe(recorded.cart.totalQuantity);
  });

  it("applies the synthetic gift card as the recorded one was", () => {
    const store = createStore();
    const recorded = giftCard.data.cartGiftCardCodesAdd.cart;
    const cart = call(store, "CartCreate", lines(WAX)).cart!;
    const answer = call(store, "CartGiftCardCodesAdd", {
      cartId: cart.id,
      giftCardCodes: [SYNTHETIC_GIFT_CARD.toLowerCase()],
    });
    expect(answer.cart?.appliedGiftCards).toEqual(recorded.appliedGiftCards);
    expect(answer.cart?.cost.totalAmount.amount).toBe(
      String(Number(recorded.cost.totalAmount.amount)),
    );
    // Once only; any other code isn't applied.
    const again = call(store, "CartGiftCardCodesAdd", {
      cartId: cart.id,
      giftCardCodes: ["NOTACARD"],
    });
    expect(again.cart?.appliedGiftCards).toHaveLength(1);
  });

  it("keeps a sold-out line at quantity 0, with the warning", () => {
    const recorded = soldOut.data.cartCreate;
    const answer = call(
      createStore(),
      "CartCreate",
      lines(outOfStock.data.product.variants.nodes[0].id),
    );
    expect(answer.warnings).toEqual(recorded.warnings);
    expect(answer.cart?.lines.nodes.map((l) => l.quantity)).toEqual(
      recorded.cart.lines.nodes.map((l) => l.quantity),
    );
    expect(answer.cart?.totalQuantity).toBe(recorded.cart.totalQuantity);
  });

  it.each([
    ["not found", notFound],
    ["below the minimum", minimumNotMet],
  ])("refuses a code %s, as recorded", (_, fixture) => {
    const recorded = fixture.data.cartDiscountCodesUpdate;
    const store = createStore();
    // Recorded on one tee.
    const cart = call(
      store,
      "CartCreate",
      lines(tee.data.product.selectedOrFirstAvailableVariant.id),
    ).cart!;
    const answer = call(store, "CartDiscountCodesUpdate", {
      cartId: cart.id,
      discountCodes: recorded.cart.discountCodes.map((c) => c.code),
    });
    expect(answer.cart?.discountCodes).toEqual(recorded.cart.discountCodes);
    expect(answer.warnings).toEqual(recorded.warnings);
    expect(answer.cart?.cost.totalAmount.amount).toBe(
      String(Number(recorded.cart.cost.totalAmount.amount)),
    );
  });

  it("leaves an already applied gift card as it is, as recorded", () => {
    const recorded = giftCardAgain.data.cartGiftCardCodesAdd;
    const store = createStore();
    const cart = call(store, "CartCreate", lines(WAX)).cart!;
    const add = () =>
      call(store, "CartGiftCardCodesAdd", {
        cartId: cart.id,
        giftCardCodes: [SYNTHETIC_GIFT_CARD],
      });
    add();
    const again = add();
    expect(again.userErrors).toEqual(recorded.userErrors);
    expect(again.warnings).toEqual(recorded.warnings);
    expect(again.cart?.appliedGiftCards).toEqual(
      recorded.cart.appliedGiftCards,
    );
  });
});
