// Shopify global ids, e.g. "gid://shopify/Product/123" or
// "gid://shopify/Cart/abc?key=xyz". Pages never see these in URLs; they use
// handles.

const GID = /^gid:\/\/shopify\/([A-Za-z]+)\/([^/?]+)(\?.*)?$/;

export function parseGid(gid: string): { type: string; id: string } | null {
  const match = GID.exec(gid);
  return match ? { type: match[1], id: match[2] } : null;
}

export function toGid(type: string, id: string | number): string {
  return `gid://shopify/${type}/${id}`;
}

// The numeric id webhooks use.
export function legacyId(gid: string): string | null {
  return parseGid(gid)?.id ?? null;
}
