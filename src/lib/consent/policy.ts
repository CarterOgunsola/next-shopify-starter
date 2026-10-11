import type { ConsentChoices, ConsentModel, ConsentState } from "./types";

// The consent policy, in one place. These are common defaults, not legal
// advice: the store owner's counsel must confirm them before launch, and
// again when the store starts selling somewhere new. A change of policy is
// a change to this object, not to the code that uses it.
//
// optOutCountries: visitors from these countries (ISO 3166-1 alpha-2 codes,
// from the host's geo header, see src/proxy.ts) get the opt-out model:
// analytics and marketing run until the visitor opts out, there is no
// banner, and the footer's "Your Privacy Choices" link opts out of the
// sale or sharing of data (the model of US state privacy laws such as the
// CCPA). Everyone else, including the EEA, the UK, Switzerland and visitors
// whose country is unknown (local development, for one), gets the opt-in
// model: only necessary cookies until the visitor chooses, with a banner
// (GDPR, UK GDPR, ePrivacy). Default ["US"]; an empty list puts every
// visitor on opt-in.
//
// gpcDeniesAnalytics: a Global Privacy Control signal always turns off
// marketing and the sale or sharing of data, and no saved choice overrides
// it. With this on it turns off analytics too, which is c15t's default and
// the conservative reading. Default true.
export const CONSENT_POLICY: {
  optOutCountries: readonly string[];
  gpcDeniesAnalytics: boolean;
} = {
  optOutCountries: ["US"],
  gpcDeniesAnalytics: true,
};

const OPT_OUT_COUNTRIES = new Set(
  CONSENT_POLICY.optOutCountries.map((code) => code.toUpperCase()),
);

export function modelForCountry(
  country: string | null | undefined,
): ConsentModel {
  const code = country?.trim().toUpperCase();
  return code && OPT_OUT_COUNTRIES.has(code) ? "optOut" : "optIn";
}

export const ALL_GRANTED: ConsentChoices = {
  necessary: true,
  preferences: true,
  analytics: true,
  marketing: true,
};

export const ONLY_NECESSARY: ConsentChoices = {
  necessary: true,
  preferences: false,
  analytics: false,
  marketing: false,
};

// What applies before the visitor makes a choice.
export function defaultConsent({
  model,
  gpc,
}: {
  model: ConsentModel;
  gpc: boolean;
}): ConsentState {
  const base = model === "optOut" ? ALL_GRANTED : ONLY_NECESSARY;
  return applyGpc({
    ...base,
    saleOfData: model === "optOut",
    gpc,
    decided: false,
  });
}

// GPC is a legally binding opt-out of sale/share. It can't be overridden by
// a saved choice, so it is applied on top of whatever the visitor picked.
export function applyGpc(state: ConsentState): ConsentState {
  return state.gpc ? limitForGpc(state) : state;
}

// What GPC turns off, for any record of the choices (the consent state, or
// the visitor consent sent to Shopify).
export function limitForGpc<
  T extends { analytics: boolean; marketing: boolean; saleOfData: boolean },
>(choices: T): T {
  return {
    ...choices,
    saleOfData: false,
    marketing: false,
    analytics: CONSENT_POLICY.gpcDeniesAnalytics ? false : choices.analytics,
  };
}

// A saved choice plus the current GPC signal.
export function resolveConsent({
  saved,
  model,
  gpc,
}: {
  saved: (ConsentChoices & { saleOfData?: boolean }) | null;
  model: ConsentModel;
  gpc: boolean;
}): ConsentState {
  if (!saved) return defaultConsent({ model, gpc });
  return applyGpc({
    ...saved,
    necessary: true,
    saleOfData: saved.saleOfData ?? saved.marketing,
    gpc,
    decided: true,
  });
}
