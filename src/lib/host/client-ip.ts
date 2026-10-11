import { isIP } from "node:net";
import { currentHost, type Host } from "./host";

// Where the visitor's IP comes from (rate limits, Shopify's per-buyer bot
// checks through Shopify-Storefront-Buyer-IP). Only headers the host's edge
// sets itself, most trusted first; never the leading x-forwarded-for entry,
// which the client controls.
// - Vercel sets x-vercel-forwarded-for and x-real-ip.
// - Cloudflare sets cf-connecting-ip.
// - If Cloudflare's proxy is put in front of Vercel, pass
//   ["cf-connecting-ip", ...TRUSTED_IP_HEADERS.vercel] as `trusted`. Not
//   otherwise: without Cloudflare in front, a client can send that header.
// Locally none of these exist, so dev falls back to the last x-forwarded-for
// entry (the hop that reached us).
export const TRUSTED_IP_HEADERS: Record<Host, readonly string[]> = {
  vercel: ["x-vercel-forwarded-for", "x-real-ip"],
  cloudflare: ["cf-connecting-ip"],
};

export function clientIp(
  headers: Headers,
  {
    host = currentHost(),
    trusted = TRUSTED_IP_HEADERS[host],
    dev = process.env.NODE_ENV !== "production",
  }: { host?: Host; trusted?: readonly string[]; dev?: boolean } = {},
): string | undefined {
  for (const name of trusted) {
    const ip = headers.get(name)?.split(",")[0]?.trim();
    if (ip && isIP(ip)) return ip;
  }
  if (!dev) return undefined;
  const lastHop = headers.get("x-forwarded-for")?.split(",").at(-1)?.trim();
  return lastHop && isIP(lastHop) ? lastHop : undefined;
}
