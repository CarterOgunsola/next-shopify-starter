// The cart's free-shipping threshold (NEXT_PUBLIC_FREE_SHIPPING_THRESHOLD,
// e.g. 50.00), read without a validation library: the cart in the browser
// needs it. Anything else reads as unset.
export const FREE_SHIPPING_PATTERN = /^\d+(\.\d{1,2})?$/;

export function freeShippingThreshold(): string | undefined {
  const value = process.env.NEXT_PUBLIC_FREE_SHIPPING_THRESHOLD?.trim();
  return value && FREE_SHIPPING_PATTERN.test(value) ? value : undefined;
}
