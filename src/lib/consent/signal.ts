import type { ConsentState } from "./types";

// The visitor's consent for code that runs outside React (Shopify's Customer
// Privacy bridge). ConsentBridge publishes here once the choice is known
// and on every change.

type Listener = (state: ConsentState) => void;

let current: ConsentState | null = null;
const listeners = new Set<Listener>();

export function publishConsent(state: ConsentState): void {
  current = state;
  for (const listener of listeners) listener(state);
}

// Called on every change from now on, and right away if consent is known.
export function onConsent(listener: Listener): () => void {
  listeners.add(listener);
  if (current) listener(current);
  return () => listeners.delete(listener);
}

// Resolves once consent is known (saved choice or region default).
export function whenConsentKnown(): Promise<ConsentState> {
  if (current) return Promise.resolve(current);
  return new Promise((resolve) => {
    const stop = onConsent((state) => {
      stop();
      resolve(state);
    });
  });
}

// For tests.
export function resetConsentSignal(): void {
  current = null;
  listeners.clear();
}
