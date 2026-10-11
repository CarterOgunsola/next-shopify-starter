import { legacyId } from "./shopify/ids";
import type { Cart, CartLine } from "./types";

// Cart helpers for the UI. No money math: amounts always come from Shopify.

// The cart with one line's quantity changed (0 removes it), shown while the
// change is on its way. Totals stay as Shopify last reported them.
export function withQuantity(
  cart: Cart,
  { lineId, quantity }: { lineId: string; quantity: number },
): Cart {
  const lines = cart.lines.flatMap((line) =>
    line.id !== lineId ? [line] : quantity > 0 ? [{ ...line, quantity }] : [],
  );
  return { ...cart, lines, totalQuantity: itemCount(lines) };
}

export function itemCount(lines: Pick<CartLine, "quantity">[]): number {
  return lines.reduce((count, line) => count + line.quantity, 0);
}

// "Lemon / 30 Servings", or nothing for single-variant products.
export function variantLabel(line: CartLine): string | null {
  const values = line.merchandise.selectedOptions
    .filter((option) => option.value !== "Default Title")
    .map((option) => option.value);
  return values.length ? values.join(" / ") : null;
}

export function cartCountLabel(count: number): string {
  return count === 1 ? "1 item" : `${count} items`;
}

// The product page with the line's variant selected (Shopify's ?variant=
// link, which the page turns into option params).
export function lineProductUrl(line: CartLine): string {
  const path = `/products/${line.merchandise.product.handle}`;
  const id = legacyId(line.merchandise.id);
  return id ? `${path}?variant=${id}` : path;
}
