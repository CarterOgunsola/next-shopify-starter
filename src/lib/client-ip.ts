import { isIP } from "node:net";

// Where the visitor's IP comes from (rate limits, Shopify's per-buyer bot
// checks). Only headers our host sets itself, most trusted first; never the
// leading x-forwarded-for entry, which the client controls.
// - Vercel sets x-vercel-forwarded-for and x-real-ip.
// - If Cloudflare is put in front of Vercel, add "cf-connecting-ip" first.
//   Not before: without Cloudflare, a client can send that header itself.
// Locally none of these exist, so dev falls back to the last x-forwarded-for
// entry (the hop that reached us).
export const TRUSTED_IP_HEADERS = ["x-vercel-forwarded-for", "x-real-ip"];

export function clientIp(
  headers: Headers,
  {
    trusted = TRUSTED_IP_HEADERS,
    dev = process.env.NODE_ENV !== "production",
  }: { trusted?: readonly string[]; dev?: boolean } = {},
): string | undefined {
  for (const name of trusted) {
    const ip = headers.get(name)?.split(",")[0]?.trim();
    if (ip && isIP(ip)) return ip;
  }
  if (!dev) return undefined;
  const lastHop = headers.get("x-forwarded-for")?.split(",").at(-1)?.trim();
  return lastHop && isIP(lastHop) ? lastHop : undefined;
}
