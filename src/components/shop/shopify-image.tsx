"use client";

import Image, { type ImageProps } from "next/image";
import { shopifyImageLoader } from "@/lib/commerce/image";

// next/image sized by Shopify's CDN. A client component because the loader
// is a function.
export function ShopifyImage({ alt, ...props }: Omit<ImageProps, "loader">) {
  return <Image alt={alt} {...props} loader={shopifyImageLoader} />;
}
