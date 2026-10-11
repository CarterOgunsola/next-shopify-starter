import type { VariantView } from "./types";
import type { Selection } from "./variant-selection";

export const VARIANT_ENDPOINT = "/api/commerce/variant";

// Browser call to the live variant endpoint. null when the product is gone.
export async function requestVariantView(
  handle: string,
  selection: Selection,
  variantId: string | null,
  signal?: AbortSignal,
): Promise<VariantView | null> {
  const response = await fetch(VARIANT_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ handle, selection, variantId }),
    signal,
  });
  if (response.status === 404) return null;
  if (!response.ok)
    throw new Error(`variant request failed: ${response.status}`);
  return (await response.json()) as VariantView;
}
