import "server-only";
import { headers } from "next/headers";
import { cache } from "react";
import { clientIp } from "@/lib/client-ip";
import { MissingBuyerIpError } from "./errors";
import type { BuyerContext } from "./types";

export { MissingBuyerIpError };

// Per-request buyer details for uncached commerce calls (variant state,
// cart, search). Shared cached reads use publicContext() instead.

// Who is shopping. Consumer only: employee or wholesale contexts would be
// built here from the signed-in customer session.
export const getBuyerContext = cache(async (): Promise<BuyerContext> => ({
  audience: "consumer",
}));

// The visitor's IP, sent to Shopify for per-buyer rate limits and bot
// checks. In production a buyer call without one is refused: falling back
// to the shared client would put every such visitor in one rate-limit
// bucket and hide the problem. Vercel always sets the header, so this only
// fires on a misconfigured host; endpoints answer it as a temporary
// failure (503), and it's logged once per instance rather than per request.
// Locally it can be undefined (shared client).
let warned = false;

export const getBuyerIp = cache(async (): Promise<string | undefined> => {
  const ip = clientIp(await headers());
  if (ip || process.env.NODE_ENV !== "production") return ip;
  if (!warned) {
    warned = true;
    console.warn("[buyer] no trusted client IP header; Shopify calls refused.");
  }
  throw new MissingBuyerIpError();
});
