import { describe, expect, it } from "vitest";
import {
  cartCountLabel,
  itemCount,
  variantLabel,
  withQuantity,
} from "./cart-view";
import mixed from "./testing/fixtures/CartCreate.one-time-and-subscription.json";
import type { CartData } from "./shopify/operations/cart";
import { toCart, toClientCart } from "./shopify/transforms/cart";

const cart = toClientCart(toCart(mixed.data.cartCreate.cart as CartData, []));

describe("cart view helpers", () => {
  it("changes one line's quantity and the count, not the money", () => {
    const [first] = cart.lines;
    const next = withQuantity(cart, { lineId: first.id, quantity: 5 });
    expect(next.lines.find((l) => l.id === first.id)?.quantity).toBe(5);
    expect(next.totalQuantity).toBe(itemCount(next.lines));
    expect(next.cost).toBe(cart.cost);
  });

  it("drops a line set to zero", () => {
    const [first] = cart.lines;
    const next = withQuantity(cart, { lineId: first.id, quantity: 0 });
    expect(next.lines.map((l) => l.id)).not.toContain(first.id);
  });

  it("labels variants without Shopify's placeholder", () => {
    const withOptions = (
      selectedOptions: { name: string; value: string }[],
    ) => ({
      ...cart.lines[0],
      merchandise: { ...cart.lines[0].merchandise, selectedOptions },
    });
    expect(
      variantLabel(withOptions([{ name: "Title", value: "Default Title" }])),
    ).toBeNull();
    expect(
      variantLabel({
        ...cart.lines[0],
        merchandise: {
          ...cart.lines[0].merchandise,
          selectedOptions: [
            { name: "Flavor", value: "Lemon" },
            { name: "Size", value: "30 Servings" },
          ],
        },
      }),
    ).toBe("Lemon / 30 Servings");
  });

  it("counts items in words", () => {
    expect(cartCountLabel(1)).toBe("1 item");
    expect(cartCountLabel(3)).toBe("3 items");
  });
});
