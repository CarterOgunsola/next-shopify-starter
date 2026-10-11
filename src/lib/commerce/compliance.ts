// Regulatory wording: the supplement module's (DSHEA disclaimer, Prop 65
// warning), which only shows for products with supplement.* metafields, and
// wording any store shows (marketing opt-in, subscription terms, review
// incentives). Every entry ships as a placeholder (approved: false) and
// needs the store owner's counsel before launch: until an entry is
// approved, pages show it with a visible "Placeholder" marker so unreviewed
// text can't go out unnoticed, and pnpm launch:check fails.

export type ComplianceText = { text: string; approved: boolean };

// 21 CFR 101.93(c): shown on any page with a structure/function claim. The
// wording may not be changed; singular for one claim, plural for several.
export const DSHEA_DISCLAIMER = {
  singular: {
    text: "This statement has not been evaluated by the Food and Drug Administration. This product is not intended to diagnose, treat, cure, or prevent any disease.",
    approved: false,
  },
  plural: {
    text: "These statements have not been evaluated by the Food and Drug Administration. This product is not intended to diagnose, treat, cure, or prevent any disease.",
    approved: false,
  },
} satisfies Record<string, ComplianceText>;

// The optional marketing email choice next to an email form, naming the
// sender; the privacy policy is linked after it.
export function marketingOptIn(sender: string): ComplianceText {
  return {
    text: `Also email me news and offers from ${sender}. Unsubscribe at any time.`,
    approved: false,
  };
}

// Next to a subscription's plan picker (automatic renewal disclosure),
// with a link to the store's subscription policy.
export const SUBSCRIPTION_TERMS: ComplianceText = {
  text: "Recurring purchase: you're charged for each delivery on this schedule until you cancel. You can cancel at any time.",
  approved: false,
};

// For a plan without a description of its own.
export const PLAN_DESCRIPTION_FALLBACK: ComplianceText = {
  text: "Delivered and charged on the schedule you choose.",
  approved: false,
};

export const SUBSCRIPTION_POLICY_PATH = "/policies/subscription-policy";

// On a review whose author got something for it (FTC Endorsement Guides).
export const REVIEW_INCENTIVE_DISCLOSURE: ComplianceText = {
  text: "This reviewer received an incentive for this review.",
  approved: false,
};

// The DSHEA disclaimer a supplement's page needs, by how many
// structure/function claims it makes: none for 0, the singular wording for
// 1, the plural for more, and the plural when the count isn't known (it
// fails closed). On the page it goes right after the description, marked *.
export function dsheaDisclaimer(claims: number | null): ComplianceText | null {
  if (claims === 0) return null;
  return claims === 1 ? DSHEA_DISCLAIMER.singular : DSHEA_DISCLAIMER.plural;
}

// A description that can be shared on its own (meta, Open Graph, Twitter,
// JSON-LD): not one with claims, whose disclaimer can't go with it.
export function shareableDescription(product: {
  seo: { description: string };
  supplement: { structureFunctionClaims: number | null } | null;
}): string | undefined {
  return product.supplement &&
    dsheaDisclaimer(product.supplement.structureFunctionClaims)
    ? undefined
    : product.seo.description;
}

// California Prop 65 short-form warning for food (27 CCR 25607.2), naming
// the chemical. Whether it shows to every visitor or only for California
// ship-to addresses is for counsel to decide.
// Set to true once counsel approves the wording.
const PROP65_APPROVED = false;

export function prop65Warning(chemical: string | null): ComplianceText {
  return {
    text: `WARNING: Consuming this product can expose you to chemicals including ${chemical ?? "[chemical]"}, which is known to the State of California to cause cancer and birth defects or other reproductive harm. For more information go to www.P65Warnings.ca.gov/food.`,
    // Never approved without the chemical: "[chemical]" is a placeholder.
    approved: PROP65_APPROVED && chemical !== null,
  };
}

// Every wording above, for the launch check (none may be a placeholder).
export function allComplianceTexts(): [string, ComplianceText][] {
  return [
    ["DSHEA disclaimer (one claim)", DSHEA_DISCLAIMER.singular],
    ["DSHEA disclaimer (claims)", DSHEA_DISCLAIMER.plural],
    ["Prop 65 warning", prop65Warning("lead")],
    ["Marketing opt-in", marketingOptIn("Brand")],
    ["Subscription terms", SUBSCRIPTION_TERMS],
    ["Plan description fallback", PLAN_DESCRIPTION_FALLBACK],
    ["Review incentive disclosure", REVIEW_INCENTIVE_DISCLOSURE],
  ];
}

export const DAILY_VALUE_NOT_ESTABLISHED = "Daily Value not established.";

export const PLACEHOLDER_MARKER = "Placeholder, pending legal review";

// Badge wording. A sale is only claimed against a higher compare-at price
// the merchant set, and "New" only within NEW_FOR_DAYS of publishing (see
// badges.ts). Merchant badges are product copy the merchant writes and
// reviews like any other.
export const BADGE_TEXT = {
  sale: "Sale",
  save: (percent: number) => `Save ${percent}%`,
  soldOut: "Sold out",
  new: "New",
  subscription: "Subscription available",
  lowStock: (left: number) => `Only ${left} left`,
};
