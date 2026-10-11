import { onConsent, whenConsentKnown } from "@/lib/consent/signal";
import { isValidHandle } from "./handles";

// Recently viewed products, kept in this browser only: product handles,
// newest first, nothing else. Stored only with preferences consent, and
// cleared when that consent is withdrawn or the customer signs out. Cards
// are fetched fresh when shown (GET /api/commerce/cards).

const KEY = "recently-viewed";
const MAX = 8;

let watching = false;

// Clears the list whenever preferences consent is off. Started by the
// header search box, which is on every page.
export function watchRecentlyViewedConsent(): void {
  if (watching || typeof window === "undefined") return;
  watching = true;
  onConsent((state) => {
    if (!state.preferences) clearRecentlyViewed();
  });
}

export async function recordProductView(handle: string): Promise<void> {
  if (!isValidHandle(handle)) return;
  const consent = await whenConsentKnown();
  if (!consent.preferences) return;
  const handles = [handle, ...read().filter((h) => h !== handle)];
  write(handles.slice(0, MAX));
}

// Handles, newest first; empty without preferences consent.
export async function recentlyViewed(): Promise<string[]> {
  const consent = await whenConsentKnown();
  return consent.preferences ? read() : [];
}

export function clearRecentlyViewed(): void {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // Storage unavailable: nothing was kept.
  }
}

function read(): string[] {
  try {
    const parsed: unknown = JSON.parse(
      window.localStorage.getItem(KEY) ?? "[]",
    );
    return Array.isArray(parsed)
      ? parsed
          .filter((h): h is string => typeof h === "string" && isValidHandle(h))
          .slice(0, MAX)
      : [];
  } catch {
    return [];
  }
}

function write(handles: string[]): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(handles));
  } catch {
    // Storage full or blocked: recently viewed just stays empty.
  }
}

// For tests.
export function resetRecentlyViewedWatch(): void {
  watching = false;
}
