import type { OrderSummary } from "@/lib/commerce";

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { dateStyle: "medium" });
}

export function statusLabel(
  order: Pick<OrderSummary, "financialStatus" | "fulfillmentStatus">,
): string {
  const words = (value: string) => value.toLowerCase().replace(/_/g, " ");
  return order.financialStatus
    ? `${words(order.financialStatus)}, ${words(order.fulfillmentStatus)}`
    : words(order.fulfillmentStatus);
}
