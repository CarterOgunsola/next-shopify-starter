"use client";

import {
  ConsentManagerProvider,
  useConsentManager,
  useHeadlessConsentUI,
} from "@c15t/nextjs/headless";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { setConsentReader } from "@/lib/analytics/track";
import { COOKIE_NAMES } from "@/lib/cookie-names";
import { C15T_CATEGORIES, fromC15t, policyFor, toC15tCategory } from "./c15t";
import { readGpc } from "./gpc";
import { defaultConsent, modelForCountry, resolveConsent } from "./policy";
import { readCountryCookie } from "./region";
import { reloadPage } from "./reload";
import { publishConsent } from "./signal";
import { visitorConsentCookie } from "./visitor-consent";
import type {
  ConsentCategory,
  ConsentChoices,
  ConsentModel,
  ConsentState,
} from "./types";

// The only file that touches the consent vendor. Everything else uses
// useConsent() and <ConsentGate>.

export const CONSENT_COOKIE = COOKIE_NAMES.consent;

export type ConsentActions = {
  acceptAll(): void;
  rejectAll(): void;
  save(choices: Omit<ConsentChoices, "necessary">): void;
  // US "Do Not Sell or Share". Turns marketing off (or back on).
  setSaleOptOut(optOut: boolean): void;
  openPreferences(): void;
  closeUI(): void;
};

export type ConsentSnapshot = {
  // false until the browser has loaded the saved choice. Nothing gated
  // renders before then.
  ready: boolean;
  state: ConsentState;
  model: ConsentModel;
  bannerOpen: boolean;
  preferencesOpen: boolean;
};

export type UseConsent = ConsentSnapshot & ConsentActions;

const notReady: ConsentSnapshot = {
  ready: false,
  state: defaultConsent({ model: "optIn", gpc: false }),
  model: "optIn",
  bannerOpen: false,
  preferencesOpen: false,
};

const noopActions: ConsentActions = {
  acceptAll() {},
  rejectAll() {},
  save() {},
  setSaleOptOut() {},
  openPreferences() {},
  closeUI() {},
};

// Small store between the c15t engine and the rest of the app, so the page
// never sits inside the vendor's provider.
function createConsentStore() {
  let snapshot = notReady;
  let actions = noopActions;
  const listeners = new Set<() => void>();
  return {
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot: () => snapshot,
    getActions: () => actions,
    set(next: ConsentSnapshot, nextActions: ConsentActions) {
      actions = nextActions;
      if (JSON.stringify(next) === JSON.stringify(snapshot)) return;
      snapshot = next;
      for (const listener of listeners) listener();
    },
  };
}

type ConsentStore = ReturnType<typeof createConsentStore>;

const StoreContext = createContext<ConsentStore | null>(null);

const noop = () => () => {};

// Browser-only inputs. null during server render and hydration.
function useBrowserEnv(): { model: ConsentModel; gpc: boolean } | null {
  const country = useSyncExternalStore(
    noop,
    () => readCountryCookie(document.cookie) ?? "",
    () => null,
  );
  const gpc = useSyncExternalStore(
    noop,
    () => readGpc(),
    () => false,
  );
  if (country === null) return null;
  return { model: modelForCountry(country || null), gpc };
}

export function ConsentProvider({ children }: { children: ReactNode }) {
  const [store] = useState(createConsentStore);
  const env = useBrowserEnv();

  // The engine mounts only once the region is known. Starting c15t with the
  // wrong policy makes it discard the saved choice (policy fingerprint
  // mismatch). It sits beside the page, not around it, so mounting it later
  // doesn't remount the page.
  return (
    <StoreContext.Provider value={store}>
      {env && <ConsentEngine store={store} model={env.model} gpc={env.gpc} />}
      <ConsentBridge />
      {children}
    </StoreContext.Provider>
  );
}

function ConsentEngine({
  store,
  model,
  gpc,
}: {
  store: ConsentStore;
  model: ConsentModel;
  gpc: boolean;
}) {
  const options = useMemo(
    () => ({
      mode: "offline" as const,
      consentCategories: [...C15T_CATEGORIES],
      storageConfig: { storageKey: CONSENT_COOKIE },
      offlinePolicy: { policyPacks: [policyFor(model)] },
      // We reload ourselves on revocation (see RevocationReload).
      reloadOnConsentRevoked: false,
    }),
    [model],
  );

  return (
    <ConsentManagerProvider options={options}>
      <EngineSync store={store} model={model} gpc={gpc} />
    </ConsentManagerProvider>
  );
}

function EngineSync({
  store,
  model,
  gpc,
}: {
  store: ConsentStore;
  model: ConsentModel;
  gpc: boolean;
}) {
  const manager = useConsentManager();
  const ui = useHeadlessConsentUI();

  const ready = !manager.isLoadingConsentInfo;
  const saved = manager.consentInfo ? fromC15t(manager.consents) : null;
  const snapshot: ConsentSnapshot = {
    ready,
    state: resolveConsent({ saved, model, gpc }),
    model,
    bannerOpen: ready && ui.banner.isVisible,
    preferencesOpen: ready && manager.activeUI === "dialog",
  };

  const actions: ConsentActions = {
    acceptAll: () => manager.saveConsents("all"),
    rejectAll: () => manager.saveConsents("necessary"),
    save(choices) {
      manager.setSelectedConsent(
        toC15tCategory.preferences,
        choices.preferences,
      );
      manager.setSelectedConsent(toC15tCategory.analytics, choices.analytics);
      manager.setSelectedConsent(toC15tCategory.marketing, choices.marketing);
      manager.saveConsents("custom");
    },
    setSaleOptOut: (optOut) =>
      manager.setConsent(toC15tCategory.marketing, !optOut),
    openPreferences: () => ui.openDialog(),
    closeUI: () => ui.closeUI(),
  };

  useEffect(() => store.set(snapshot, actions));

  return null;
}

// Hands consent to the event bus (so track() can check it outside React)
// and reloads the page when analytics or marketing is withdrawn, because a
// vendor script that already ran can't be unloaded.
function ConsentBridge() {
  const { ready, state } = useConsent();
  const latest = useRef<ConsentState | null>(null);
  const previous = useRef<ConsentState | null>(null);

  useEffect(() => {
    latest.current = ready ? state : null;
  });

  useEffect(() => {
    setConsentReader(() => latest.current);
    return () => setConsentReader(() => null);
  }, []);

  useEffect(() => {
    if (!ready) return;
    publishConsent(state);
    // Consent is known (the banner, if any, is decided): for tests and
    // styles that wait on it.
    document.documentElement.dataset.consent = "ready";
    // For the server's Shopify cart calls (see visitor-consent.ts).
    document.cookie = visitorConsentCookie(state);
    const before = previous.current;
    previous.current = state;
    if (!before) return;
    if (
      (before.analytics && !state.analytics) ||
      (before.marketing && !state.marketing)
    ) {
      reloadPage();
    }
  }, [ready, state]);

  return null;
}

export function useConsent(): UseConsent {
  const store = useContext(StoreContext);
  if (!store) throw new Error("useConsent() needs <ConsentProvider>.");
  const snapshot = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    () => notReady,
  );
  // Actions read the latest engine callbacks at call time.
  return {
    ...snapshot,
    acceptAll: () => store.getActions().acceptAll(),
    rejectAll: () => store.getActions().rejectAll(),
    save: (choices) => store.getActions().save(choices),
    setSaleOptOut: (optOut) => store.getActions().setSaleOptOut(optOut),
    openPreferences: () => store.getActions().openPreferences(),
    closeUI: () => store.getActions().closeUI(),
  };
}

export { onConsent, whenConsentKnown } from "./signal";

// Renders children only once consent for the category is known and granted.
export function ConsentGate({
  category,
  children,
}: {
  category: ConsentCategory;
  children: ReactNode;
}) {
  const { ready, state } = useConsent();
  if (!ready || !state[category]) return null;
  return <>{children}</>;
}
