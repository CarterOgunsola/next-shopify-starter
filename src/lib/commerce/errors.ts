import { ShopifyTransientError } from "./shopify/errors";

// A buyer call in production with no trusted client IP header (see
// getBuyerIp). Vercel and Cloudflare always set one, so it means a
// misconfigured host.
export class MissingBuyerIpError extends Error {
  constructor() {
    super("No trusted client IP header on a buyer request");
    this.name = "MissingBuyerIpError";
  }
}

// For callers outside lib/commerce: the shop can't serve this request right
// now and a retry may work. Shopify is briefly unavailable (throttled,
// timed out, 5xx), or the request has no client IP to send it.
export function isTemporaryFailure(error: unknown): boolean {
  return (
    error instanceof ShopifyTransientError ||
    error instanceof MissingBuyerIpError
  );
}
