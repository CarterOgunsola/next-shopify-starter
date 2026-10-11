"use server";

import { z } from "zod";
import { isShopEnabled } from "@/lib/flags";
import { getBuyerContext } from "./buyer.server";
import { CART_ERRORS } from "./cart-messages";
import { addToCart, removeFromCart, updateCart } from "./cart.server";
import { discountCodeSchema } from "./discount-code";
import {
  applyDiscountCode,
  removeDiscountCode,
  removeGiftCard,
} from "./discount.server";
import { lineAttributesSchema } from "./gift-card.server";
import type { CartResult } from "./types";

// Cart changes from the browser. Inputs are checked here; Shopify checks
// stock and limits. The cart id comes from the cookie, never the request.

const variantId = z.string().regex(/^gid:\/\/shopify\/ProductVariant\/\d+$/);
const sellingPlanId = z.string().regex(/^gid:\/\/shopify\/SellingPlan\/\d+$/);
const lineId = z
  .string()
  .regex(/^gid:\/\/shopify\/CartLine\/[\w-]+(\?cart=[\w-]+)?$/);

const addSchema = z
  .array(
    z.object({
      merchandiseId: variantId,
      quantity: z.number().int().min(1).max(100),
      sellingPlanId: sellingPlanId.optional(),
      // Gift card recipient details only.
      attributes: lineAttributesSchema.optional(),
    }),
  )
  .min(1)
  .max(25);

const updateSchema = z
  .array(
    z.object({
      id: lineId,
      quantity: z.number().int().min(0).max(100).optional(),
      sellingPlanId: sellingPlanId.nullable().optional(),
    }),
  )
  .min(1)
  .max(25)
  // Each update changes something.
  .refine((lines) =>
    lines.every(
      (line) => line.quantity !== undefined || line.sellingPlanId !== undefined,
    ),
  );

const removeSchema = z.array(lineId).min(1).max(25);

function rejected(error: string): CartResult {
  return { ok: false, error, cart: null };
}

export async function addCartLines(lines: unknown): Promise<CartResult> {
  if (!isShopEnabled()) return rejected(CART_ERRORS.closed);
  const parsed = addSchema.safeParse(lines);
  if (!parsed.success) return rejected(CART_ERRORS.invalid);
  return addToCart(parsed.data, await getBuyerContext());
}

export async function updateCartLines(lines: unknown): Promise<CartResult> {
  if (!isShopEnabled()) return rejected(CART_ERRORS.closed);
  const parsed = updateSchema.safeParse(lines);
  if (!parsed.success) return rejected(CART_ERRORS.invalid);
  return updateCart(parsed.data, await getBuyerContext());
}

export async function removeCartLines(lineIds: unknown): Promise<CartResult> {
  if (!isShopEnabled()) return rejected(CART_ERRORS.closed);
  const parsed = removeSchema.safeParse(lineIds);
  if (!parsed.success) return rejected(CART_ERRORS.invalid);
  return removeFromCart(parsed.data, await getBuyerContext());
}

export async function applyCartDiscountCode(
  code: unknown,
): Promise<CartResult> {
  if (!isShopEnabled()) return rejected(CART_ERRORS.closed);
  const parsed = discountCodeSchema.safeParse(code);
  if (!parsed.success) return rejected(CART_ERRORS.invalid);
  return applyDiscountCode(parsed.data, await getBuyerContext());
}

export async function removeCartDiscountCode(
  code: unknown,
): Promise<CartResult> {
  if (!isShopEnabled()) return rejected(CART_ERRORS.closed);
  const parsed = discountCodeSchema.safeParse(code);
  if (!parsed.success) return rejected(CART_ERRORS.invalid);
  return removeDiscountCode(parsed.data, await getBuyerContext());
}

const appliedGiftCardId = z
  .string()
  .regex(/^gid:\/\/shopify\/AppliedGiftCard\/\d+$/);

export async function removeCartGiftCard(id: unknown): Promise<CartResult> {
  if (!isShopEnabled()) return rejected(CART_ERRORS.closed);
  const parsed = appliedGiftCardId.safeParse(id);
  if (!parsed.success) return rejected(CART_ERRORS.invalid);
  return removeGiftCard(parsed.data, await getBuyerContext());
}
