// Our consent model. Vendor-neutral: the consent engine (c15t today) is an
// implementation detail behind src/lib/consent.

export type ConsentCategory =
  "necessary" | "preferences" | "analytics" | "marketing";

export type ConsentChoices = {
  necessary: true;
  preferences: boolean;
  analytics: boolean;
  marketing: boolean;
};

export type ConsentState = ConsentChoices & {
  // US "sale or share" of personal data. false = the visitor opted out
  // (directly, or through Global Privacy Control).
  saleOfData: boolean;
  // Browser sent Global Privacy Control.
  gpc: boolean;
  // The visitor has made a choice. Until then the region defaults apply.
  decided: boolean;
};

// "optOut": non-essential on until the visitor opts out (US).
// "optIn": only necessary until the visitor opts in (EEA, UK, CH, unknown).
export type ConsentModel = "optOut" | "optIn";
