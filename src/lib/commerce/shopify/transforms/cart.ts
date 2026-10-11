import { cartWarningMessage } from "../../cart-messages";
import { savingPercent } from "./variant";
import type { Cart, CartLine, CartRecord } from "../../types";
import type { CartData } from "../operations/cart";
import { toImage } from "./media";

type LineData = CartData["lines"]["nodes"][number];

export function toCart(
  cart: CartData,
  warnings: readonly { code: string }[],
): CartRecord {
  return {
    id: cart.id,
    updatedAt: cart.updatedAt,
    checkoutUrl: cart.checkoutUrl,
    totalQuantity: cart.totalQuantity,
    // Shopify keeps sold-out lines at quantity 0; the warning explains them.
    lines: cart.lines.nodes.flatMap((line) => {
      const mapped = toCartLine(line);
      return mapped && mapped.quantity > 0 ? [mapped] : [];
    }),
    cost: {
      subtotalAmount: cart.cost.subtotalAmount,
      totalAmount: cart.cost.totalAmount,
      checkoutChargeAmount: cart.cost.checkoutChargeAmount,
    },
    note: cart.note || null,
    attributes: cart.attributes.map(({ key, value }) => ({
      key,
      value: value ?? "",
    })),
    discounts: orderDiscounts(cart.lines.nodes),
    discountCodes: cart.discountCodes.map(({ code, applicable }) => ({
      code,
      applicable,
    })),
    giftCards: cart.appliedGiftCards.map((card) => ({
      id: card.id,
      lastCharacters: card.lastCharacters,
      amountUsed: card.amountUsed,
      balance: card.balance,
    })),
    warnings: [...new Set(warnings.map((warning) => warning.code))].map(
      (code) => ({ code, message: cartWarningMessage(code) }),
    ),
  };
}

// What the browser may see: everything but the id and checkout URL.
export function toClientCart({
  id,
  checkoutUrl: _,
  ...cart
}: CartRecord): Cart {
  return { ...cart, analyticsId: id.split("?")[0] };
}

type AllocationData = LineData["discountAllocations"][number];

function toDiscount(allocation: AllocationData) {
  return {
    label:
      ("code" in allocation && allocation.code) ||
      ("title" in allocation && allocation.title) ||
      "Discount",
    amount: allocation.discountedAmount,
  };
}

// "7.2" -> 720, without float rounding.
function cents(amount: string): number {
  const [whole, fraction = ""] = amount.split(".");
  const sign = whole.startsWith("-") ? -1 : 1;
  return (
    Number(whole) * 100 + sign * Number(fraction.padEnd(2, "0").slice(0, 2))
  );
}

// Order-level discounts across the cart, by code or title: each line's
// discounts minus its line-level ones (which are already in the line
// total), summed. Shopify's cost.totalAmount stays the source of truth for
// the total; these only label the difference.
function orderDiscounts(lines: readonly LineData[]) {
  const totals = new Map<string, { cents: number; currencyCode: string }>();
  const add = (allocation: AllocationData, sign: 1 | -1) => {
    const { label, amount } = toDiscount(allocation);
    const entry = totals.get(label) ?? {
      cents: 0,
      currencyCode: amount.currencyCode,
    };
    entry.cents += sign * cents(amount.amount);
    totals.set(label, entry);
  };
  for (const line of lines) {
    for (const allocation of line.allDiscountAllocations) add(allocation, 1);
    for (const allocation of line.discountAllocations) add(allocation, -1);
  }
  return [...totals]
    .filter(([, total]) => total.cents > 0)
    .map(([label, total]) => ({
      label,
      amount: {
        amount: (total.cents / 100).toFixed(2),
        currencyCode: total.currencyCode,
      } as AllocationData["discountedAmount"],
    }));
}

function toCartLine(line: LineData): CartLine | null {
  const merchandise = line.merchandise;
  if (merchandise.__typename !== "ProductVariant") return null;
  return {
    id: line.id,
    quantity: line.quantity,
    attributes: line.attributes.map(({ key, value }) => ({
      key,
      value: value ?? "",
    })),
    parentLineId:
      ("parentRelationship" in line && line.parentRelationship?.parent.id) ||
      null,
    merchandise: {
      id: merchandise.id,
      title: merchandise.title,
      sku: merchandise.sku || null,
      ...(merchandise.quantityRule
        ? {
            quantityRule: {
              min: merchandise.quantityRule.minimum,
              ...(merchandise.quantityRule.maximum != null
                ? { max: merchandise.quantityRule.maximum }
                : {}),
              increment: merchandise.quantityRule.increment,
            },
          }
        : {}),
      product: {
        id: merchandise.product.id,
        handle: merchandise.product.handle,
        title: merchandise.product.title,
        vendor: merchandise.product.vendor,
        productType: merchandise.product.productType,
      },
      image: merchandise.image ? toImage(merchandise.image) : null,
      selectedOptions: merchandise.selectedOptions.map(({ name, value }) => ({
        name,
        value,
      })),
    },
    sellingPlan: line.sellingPlanAllocation
      ? {
          id: line.sellingPlanAllocation.sellingPlan.id,
          name: line.sellingPlanAllocation.sellingPlan.name,
        }
      : null,
    planOptions: merchandise.sellingPlanAllocations.nodes.flatMap(
      (allocation) => {
        // The ongoing price, per delivery.
        const [first] = allocation.priceAdjustments;
        const ongoing = allocation.priceAdjustments.at(-1);
        return first && ongoing
          ? [
              {
                id: allocation.sellingPlan.id,
                name: allocation.sellingPlan.name,
                price: ongoing.perDeliveryPrice,
                recurring: allocation.sellingPlan.recurringDeliveries,
                saves: savingPercent(ongoing) > 0,
                // Paid up front for several deliveries: the price charged
                // isn't the price of one delivery. (An introductory price
                // is still per delivery.)
                prepaid:
                  Number(first.price.amount) !==
                  Number(first.perDeliveryPrice.amount),
              },
            ]
          : [];
      },
    ),
    requiresSellingPlan: merchandise.product.requiresSellingPlan,
    isGiftCard: merchandise.product.isGiftCard,
    discounts: line.discountAllocations.map(toDiscount),
    cost: {
      amountPerQuantity: line.cost.amountPerQuantity,
      compareAtAmountPerQuantity: line.cost.compareAtAmountPerQuantity ?? null,
      totalAmount: line.cost.totalAmount,
    },
  };
}
