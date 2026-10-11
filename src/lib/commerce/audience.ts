import type { BuyerContext, PublicContext } from "./types";

// The only place a PublicContext is minted. getBuyerContext()
// (buyer.server.ts) builds the per-request BuyerContext.

export function toPublicContext(buyer: BuyerContext): PublicContext | null {
  return buyer.audience === "consumer" ? (buyer as PublicContext) : null;
}

// For shared pages that every visitor sees the same way (shop landing,
// product content).
export function publicContext(): PublicContext {
  return { audience: "consumer" } as PublicContext;
}
