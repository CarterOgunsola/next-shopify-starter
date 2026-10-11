"use client";

import { useSearchParams } from "next/navigation";
import type { ProductContent } from "@/lib/commerce";
import {
  leadWith,
  parseSelection,
  variantImageFor,
} from "@/lib/commerce/variant-selection";
import { ProductMedia } from "./product-media";

// Media that leads with the selected variant's image, read from the URL.
export function ProductGallery({
  product,
}: {
  product: Pick<ProductContent, "media" | "options" | "variantImages">;
}) {
  const selection = parseSelection(useSearchParams(), product.options);
  const lead = variantImageFor(selection, product.variantImages);
  return <ProductMedia media={leadWith(product.media, lead)} />;
}
