import type { ConsentChoices, ConsentModel } from "./types";

// Mapping between our categories and c15t's. c15t's names are fixed:
// necessary, functionality, experience, measurement, marketing.

type C15tCategory =
  "necessary" | "functionality" | "experience" | "measurement" | "marketing";

export const C15T_CATEGORIES = [
  "necessary",
  "experience",
  "measurement",
  "marketing",
] as const satisfies readonly C15tCategory[];

export const toC15tCategory = {
  necessary: "necessary",
  preferences: "experience",
  analytics: "measurement",
  marketing: "marketing",
} as const satisfies Record<keyof ConsentChoices, C15tCategory>;

export function fromC15t(
  consents: Partial<Record<C15tCategory, boolean>>,
): ConsentChoices {
  return {
    necessary: true,
    preferences: consents.experience === true,
    analytics: consents.measurement === true,
    marketing: consents.marketing === true,
  };
}

// One policy, built from our own region decision (see policy.ts), so c15t's
// jurisdiction tables never decide anything. Opt-in regions get a banner;
// the opt-out model (the US by default) relies on the "Your Privacy
// Choices" link instead.
export function policyFor(model: ConsentModel) {
  return {
    id: model === "optOut" ? "opt-out" : "opt-in",
    match: { isDefault: true },
    consent: {
      model: model === "optOut" ? ("opt-out" as const) : ("opt-in" as const),
      categories: [...C15T_CATEGORIES],
      gpc: true,
    },
    ui: {
      mode: model === "optOut" ? ("none" as const) : ("banner" as const),
    },
  };
}
