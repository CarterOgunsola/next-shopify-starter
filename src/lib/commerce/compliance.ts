// Regulatory wording any store shows (marketing opt-in, subscription
// terms, review incentives). Every entry ships as a placeholder
// (approved: false) and needs the store owner's counsel before launch:
// until an entry is approved, pages show it with a visible "Placeholder"
// marker so unreviewed text can't go out unnoticed, and pnpm launch:check
// fails.

export type ComplianceText = { text: string; approved: boolean };

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

// Every wording above, for the launch check (none may be a placeholder).
export function allComplianceTexts(): [string, ComplianceText][] {
  return [
    ["Marketing opt-in", marketingOptIn("Brand")],
    ["Subscription terms", SUBSCRIPTION_TERMS],
    ["Plan description fallback", PLAN_DESCRIPTION_FALLBACK],
    ["Review incentive disclosure", REVIEW_INCENTIVE_DISCLOSURE],
  ];
}

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
