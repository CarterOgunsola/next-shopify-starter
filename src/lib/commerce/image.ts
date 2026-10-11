import type { ImageLoaderProps } from "next/image";

// next/image loader for product images: Shopify's CDN resizes on request
// (?width=), so the images skip Next's optimizer. Existing query params such
// as ?v= are kept.
export function shopifyImageLoader({ src, width }: ImageLoaderProps): string {
  const url = new URL(src);
  if (url.hostname !== "cdn.shopify.com") return src;
  url.searchParams.set("width", String(width));
  return url.toString();
}
