import "server-only";
import { NotImplementedError } from "@/lib/not-implemented";
import { getBuyerIp } from "./buyer.server";
import {
  fetchVariantOptions,
  fetchVariantResolution,
  fetchVariantView,
} from "./shopify/operations/variants";
import type { BuyerContext, PriceRange, VariantView } from "./types";

// Buyer-specific commerce state. Never cached across requests.

// The variant for a selection (option name -> value), with live price and
// stock and per-value availability. null when the product doesn't exist.
// The buyer goes into @inContext once B2B pricing exists.
//
// Shopify picks the first available variant when the selection is
// incomplete, sold out or doesn't exist. That would drop values the visitor
// chose (?color=black&size=xl landing on Black / XS, or ?color=forest&
// fit=relaxed on Black / XS / Regular), so when it does, the request is
// repeated with the closest existing combination: as many of the visitor's
// values as exist together, earlier options first.
export async function getVariantView(
  handle: string,
  selection: Record<string, string>,
  _buyer: BuyerContext,
  variantId?: string,
): Promise<VariantView | null> {
  const buyerIp = await getBuyerIp();
  let wanted = toSelectedOptions(selection);
  if (variantId && wanted.length === 0) {
    wanted = (await fetchVariantOptions(handle, variantId, buyerIp)) ?? [];
  }

  const first = await fetchVariantResolution(handle, wanted, buyerIp);
  if (!first) return null;
  const { view, closest } = first;
  const resolved = view.variant?.selectedOptions;
  if (!resolved || matches(resolved, wanted)) return view;
  if (!closest || matches(resolved, closest)) return view;

  const retry = await fetchVariantView(handle, closest, buyerIp, wanted);
  return retry?.variant && matches(retry.variant.selectedOptions, closest)
    ? retry
    : view;
}

function toSelectedOptions(selection: Record<string, string>) {
  return Object.entries(selection).map(([name, value]) => ({ name, value }));
}

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

// Does the variant have every value the visitor asked for?
function matches(
  variant: { name: string; value: string }[],
  wanted: { name: string; value: string }[],
): boolean {
  return wanted.every((w) =>
    variant.some((v) => same(v.name, w.name) && same(v.value, w.value)),
  );
}

// Not built: prices for listing tiles per buyer (for B2B or member
// pricing), keyed by product id. Consumer tiles use the cached card prices.
export async function getPriceList(
  _productIds: string[],
  _buyer: BuyerContext,
): Promise<Map<string, PriceRange>> {
  throw new NotImplementedError("getPriceList");
}
