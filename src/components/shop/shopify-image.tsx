"use client";

import Image, { type ImageProps } from "next/image";
import type { Ref } from "react";
import { shopifyImageLoader } from "@/lib/commerce/image";

// next/image sized by Shopify's CDN. A client component because the loader
// is a function.
export function ShopifyImage({
  alt,
  ref,
  ...props
}: Omit<ImageProps, "loader"> & { ref?: Ref<HTMLImageElement> }) {
  return <Image alt={alt} ref={ref} {...props} loader={shopifyImageLoader} />;
}
