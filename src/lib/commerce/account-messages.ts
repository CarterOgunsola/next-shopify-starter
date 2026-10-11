// Our wording for the Customer Account API's userErrors codes. Shopify's
// own messages aren't shown: they can change and aren't written for this
// site. Field paths map to the form field names the pages use.

const ADDRESS: Record<string, string> = {
  ADDRESS1_MISSING: "Enter the street address.",
  COUNTRY_CODE_MISSING: "Choose a country.",
  TERRITORY_CODE_MISSING: "Choose a country.",
  COUNTRY_NOT_EXIST: "Choose a country from the list.",
  INVALID_TERRITORY_CODE: "Choose a country from the list.",
  ZONE_CODE_MISSING: "Choose a state or province.",
  INVALID_FOR_COUNTRY: "This doesn't match the country.",
  INVALID_FOR_COUNTRY_AND_PROVINCE: "This doesn't match the state or province.",
  PHONE_NUMBER_NOT_VALID: "Enter a valid phone number.",
  CUSTOMER_ADDRESS_ALREADY_EXISTS: "You already saved this address.",
  DELETING_CUSTOMER_DEFAULT_ADDRESS_NOT_ALLOWED:
    "Choose another default address before deleting this one.",
  DEMOTING_CUSTOMER_DEFAULT_ADDRESS_NOT_ALLOWED:
    "Choose another address as the default instead.",
  ADDRESS_ID_DOES_NOT_EXIST: "That address no longer exists.",
  CONTAINS_HTML_TAGS: "Remove the < and > characters.",
  TOO_LONG: "This is too long.",
  REQUIRED: "This is required.",
};

const PROFILE: Record<string, string> = {
  CONTAINS_HTML_TAGS: "Remove the < and > characters.",
  CONTAINS_URL: "Names can't contain web addresses.",
  TOO_LONG: "This is too long.",
};

// Sign-in that comes back to `path` (through /account/link-cart, which ties
// the cart to the customer first).
export function signInHref(path: string): string {
  const back = `/account/link-cart?return_to=${encodeURIComponent(path)}`;
  return `/account/login?return_to=${encodeURIComponent(back)}`;
}

export const ACCOUNT_ERRORS = {
  signedOut: "Your session ended. Sign in again to make changes.",
  failed: "That didn't save. Try again.",
  invalid: "Check the highlighted fields.",
};

type UserError = {
  code: string | null;
  field: readonly string[] | null;
  message: string;
};

// The fields each form renders. An error on any other field (addressId,
// or one the form doesn't show) becomes the general message, so nothing
// points at a field the customer can't see.
export const ADDRESS_FIELDS = [
  "firstName",
  "lastName",
  "company",
  "address1",
  "address2",
  "city",
  "zoneCode",
  "zip",
  "countryCode",
  "phoneNumber",
] as const;
export const PROFILE_FIELDS = ["firstName", "lastName"] as const;

// Shopify's field names that differ from ours.
const FIELD_ALIASES: Record<string, string> = { territoryCode: "countryCode" };

// { form field name: message } plus a summary for role=alert.
export function describeUserErrors(
  errors: UserError[],
  kind: "address" | "profile",
): { error: string; fieldErrors: Record<string, string> } {
  const words = kind === "address" ? ADDRESS : PROFILE;
  const fields: readonly string[] =
    kind === "address" ? ADDRESS_FIELDS : PROFILE_FIELDS;
  const fieldErrors: Record<string, string> = {};
  let general: string | null = null;
  for (const error of errors) {
    const message = (error.code && words[error.code]) || ACCOUNT_ERRORS.failed;
    const last = error.field?.at(-1);
    const field = last && (FIELD_ALIASES[last] ?? last);
    if (field && fields.includes(field)) fieldErrors[field] ??= message;
    else general ??= message;
  }
  return {
    error: general ?? ACCOUNT_ERRORS.invalid,
    fieldErrors,
  };
}
