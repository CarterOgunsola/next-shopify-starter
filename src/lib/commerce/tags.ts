import { createHash } from "node:crypto";

// Cache tags shared by the cached catalog reads and the webhook handler,
// so both sides spell them the same way. Next skips tags over 256
// characters, and a Shopify handle can be 255 on its own, so a long handle
// is replaced by a hash of it (the same on both sides).

const MAX_TAG = 256;

function keyed(prefix: string, key: string): string {
  const tag = `${prefix}-${key}`;
  if (tag.length <= MAX_TAG) return tag;
  const hash = createHash("sha256").update(key).digest("hex").slice(0, 32);
  return `${prefix}-h-${hash}`;
}

export const tags = {
  product: (handle: string) => keyed("product", handle),
  // Webhooks identify products by numeric id; handles can change.
  productId: (legacyId: string) => `product-id-${legacyId}`,
  collection: (handle: string) => keyed("collection", handle),
  collectionId: (legacyId: string) => `collection-id-${legacyId}`,
  metaobject: (type: string) => keyed("metaobject", type),
  menu: (handle: string) => keyed("menu", handle),
  // A product's reviews (from the review app, not Shopify).
  reviews: (handle: string) => keyed("reviews", handle),
  shop: "shop",
  // Every menu: Shopify sends no webhook for menu changes, so they're
  // refreshed together (POST /api/revalidate/menus).
  menus: "menus",
  productsIndex: "products-index",
  collectionsIndex: "collections-index",
} as const;
