// Shopify handles are lowercase letters, digits, hyphens and underscores.
// Anything else 404s without a Shopify call, so junk URLs can't fill the
// cache.
const HANDLE = /^[a-z0-9][a-z0-9_-]{0,254}$/;

export function isValidHandle(handle: string): boolean {
  return HANDLE.test(handle);
}
