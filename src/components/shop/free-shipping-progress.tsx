import { formatMoney, type Money } from "@/lib/commerce";
import { freeShippingProgress } from "@/lib/commerce/shipping";

export function FreeShippingProgress({
  subtotal,
  threshold,
}: {
  subtotal: Money;
  threshold: string;
}) {
  const progress = freeShippingProgress(subtotal, threshold);
  const label = progress.qualified
    ? "Your order ships free."
    : `Spend ${formatMoney(progress.remaining)} more for free shipping.`;
  return (
    <div>
      <p>{label}</p>
      <progress
        value={progress.percent}
        max={100}
        aria-label="Progress to free shipping"
      />
    </div>
  );
}
