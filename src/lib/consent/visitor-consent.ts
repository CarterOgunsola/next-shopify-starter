import { COOKIE_NAMES } from "@/lib/cookie-names";
import type { ConsentState } from "./types";

// The visitor's consent in a small first-party cookie of our own, so server
// code can pass it to Shopify (@inContext(visitorConsent) on cart calls,
// which puts it on the checkout URL). Written by the consent layer whenever
// the choice is known or changes; it records the choice itself, so it's a
// necessary cookie. Format: a1m0p1s0 (analytics, marketing, preferences,
// sale of data).

export const VISITOR_CONSENT_COOKIE = COOKIE_NAMES.visitorConsent;

export type VisitorConsent = {
  analytics: boolean;
  marketing: boolean;
  preferences: boolean;
  saleOfData: boolean;
};

const bit = (value: boolean) => (value ? "1" : "0");

export function encodeVisitorConsent(state: ConsentState): string {
  return `a${bit(state.analytics)}m${bit(state.marketing)}p${bit(state.preferences)}s${bit(state.saleOfData)}`;
}

// Anything else (missing, edited, an older format) means no stated choice.
export function decodeVisitorConsent(
  value: string | undefined,
): VisitorConsent | undefined {
  const match = /^a([01])m([01])p([01])s([01])$/.exec(value ?? "");
  if (!match) return undefined;
  const [, analytics, marketing, preferences, saleOfData] = match;
  return {
    analytics: analytics === "1",
    marketing: marketing === "1",
    preferences: preferences === "1",
    saleOfData: saleOfData === "1",
  };
}

export function visitorConsentCookie(state: ConsentState): string {
  return `${VISITOR_CONSENT_COOKIE}=${encodeVisitorConsent(state)}; Path=/; Max-Age=31536000; SameSite=Lax; Secure`;
}
