"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { isShopEnabled } from "@/lib/flags";
import { hasExtension, isCountry, isZoneOf, toE164, ZONES } from "./zones";
import {
  ACCOUNT_ERRORS,
  describeUserErrors,
  signInHref,
} from "./account-messages";
import { actionCustomer } from "./customer-token.server";
import {
  createAddress,
  deleteAddress,
  updateAddress,
  updateProfile,
  type CustomerCall,
  type UserError,
} from "./shopify/operations/customer";
import type { AccountActionResult, AddressInput } from "./types";

// Account changes from the account pages' forms. Each checks the session
// (refreshing an expired token), validates the form, and answers in our
// wording. Customer data isn't logged; failures log the error class only.
// On success the page re-renders from the API.

const text = (max: number) => z.string().trim().max(max);
const noTags = (value: string) => !/[<>]/.test(value);

const profileSchema = z.object({
  firstName: text(255).refine(noTags, "Remove the < and > characters."),
  lastName: text(255).refine(noTags, "Remove the < and > characters."),
});

const addressSchema = z
  .object({
    firstName: text(255).refine(noTags, "Remove the < and > characters."),
    lastName: text(255).refine(noTags, "Remove the < and > characters."),
    company: text(255).refine(noTags, "Remove the < and > characters."),
    address1: text(255)
      .min(1, "Enter the street address.")
      .refine(noTags, "Remove the < and > characters."),
    address2: text(255).refine(noTags, "Remove the < and > characters."),
    city: text(255)
      .min(1, "Enter the city.")
      .refine(noTags, "Remove the < and > characters."),
    zoneCode: z.string().trim().toUpperCase(),
    countryCode: z
      .string()
      .trim()
      .toUpperCase()
      .refine(isCountry, "Choose a country."),
    zip: text(20).refine(noTags, "Remove the < and > characters."),
    phoneNumber: z.string().trim(),
  })
  // The state or province must be one of the country's, and the phone
  // number is stored in E.164 (+13125550123).
  .superRefine((address, context) => {
    if (
      isCountry(address.countryCode) &&
      !isZoneOf(address.countryCode, address.zoneCode)
    ) {
      context.addIssue({
        code: "custom",
        path: ["zoneCode"],
        message: `Choose a ${ZONES[address.countryCode].label.toLowerCase()}.`,
      });
    }
    if (toE164(address.phoneNumber, address.countryCode) === null) {
      context.addIssue({
        code: "custom",
        path: ["phoneNumber"],
        message: hasExtension(address.phoneNumber)
          ? "Leave out the extension: the address can only hold the number."
          : "Enter a phone number, with the country code (+44 …) outside the US and Canada.",
      });
    }
  })
  .transform((address) => ({
    ...address,
    phoneNumber: toE164(address.phoneNumber, address.countryCode) ?? "",
  }));

const addressId = z
  .string()
  .regex(/^gid:\/\/shopify\/CustomerAddress\/\d+(\?[\w=&-]*)?$/);

function fields(form: FormData, names: readonly string[]) {
  return Object.fromEntries(
    names.map((name) => [name, String(form.get(name) ?? "")]),
  );
}

function invalid(error: z.ZodError): AccountActionResult {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    const name = String(issue.path[0]);
    fieldErrors[name] ??= issue.message;
  }
  return { ok: false, error: ACCOUNT_ERRORS.invalid, fieldErrors };
}

// The page each kind of change is made on, to come back to after signing in.
const PAGES = { address: "/account/addresses", profile: "/account/profile" };

// Runs a change for the signed-in customer: the session check, Shopify's
// userErrors in our words, and a refresh of the page on success.
async function change(
  kind: "address" | "profile",
  run: (call: CustomerCall) => Promise<UserError[]>,
  success: string,
): Promise<AccountActionResult> {
  if (!isShopEnabled()) return { ok: false, error: ACCOUNT_ERRORS.failed };
  let call: CustomerCall | null;
  try {
    call = await actionCustomer();
  } catch (error) {
    // Shopify unreachable or the like: not the session's fault.
    console.warn(
      `[accounts] session check failed: ${error instanceof Error ? error.name : typeof error}`,
    );
    return { ok: false, error: ACCOUNT_ERRORS.failed };
  }
  if (!call) {
    return {
      ok: false,
      error: ACCOUNT_ERRORS.signedOut,
      signIn: signInHref(PAGES[kind]),
    };
  }
  try {
    const errors = await run(call);
    if (errors.length)
      return { ok: false, ...describeUserErrors(errors, kind) };
  } catch (error) {
    console.warn(
      `[accounts] change failed: ${error instanceof Error ? error.name : typeof error}`,
    );
    return { ok: false, error: ACCOUNT_ERRORS.failed };
  }
  refresh();
  return { ok: true, message: success };
}

// A failed save carries back what was submitted (see AccountActionResult).
function keepValues(
  result: AccountActionResult,
  values: Record<string, string>,
): AccountActionResult {
  return result.ok ? result : { ...result, values };
}

export async function saveProfile(
  _previous: AccountActionResult | null,
  form: FormData,
): Promise<AccountActionResult> {
  const values = fields(form, ["firstName", "lastName"]);
  const parsed = profileSchema.safeParse(values);
  if (!parsed.success) return keepValues(invalid(parsed.error), values);
  return keepValues(
    await change(
      "profile",
      (call) => updateProfile(call, parsed.data),
      "Your name was saved.",
    ),
    values,
  );
}

const ADDRESS_FIELDS = [
  "firstName",
  "lastName",
  "company",
  "address1",
  "address2",
  "city",
  "zoneCode",
  "countryCode",
  "zip",
  "phoneNumber",
] as const;

// Adds an address (no id) or updates one. "default" makes it the default.
export async function saveAddress(
  _previous: AccountActionResult | null,
  form: FormData,
): Promise<AccountActionResult> {
  const values = {
    ...fields(form, ADDRESS_FIELDS),
    default: form.get("default") === "on" ? "on" : "",
  };
  return keepValues(await submitAddress(form, values), values);
}

async function submitAddress(
  form: FormData,
  values: Record<string, string>,
): Promise<AccountActionResult> {
  const parsed = addressSchema.safeParse(values);
  if (!parsed.success) return invalid(parsed.error);
  const input: AddressInput = parsed.data;
  const makeDefault = form.get("default") === "on";
  const rawId = form.get("id");
  if (rawId) {
    const id = addressId.safeParse(rawId);
    if (!id.success) return { ok: false, error: ACCOUNT_ERRORS.failed };
    return change(
      "address",
      (call) => updateAddress(call, id.data, input, makeDefault),
      "Address saved.",
    );
  }
  return change(
    "address",
    (call) => createAddress(call, input, makeDefault),
    "Address added.",
  );
}

export async function removeAddress(id: unknown): Promise<AccountActionResult> {
  const parsed = addressId.safeParse(id);
  if (!parsed.success) return { ok: false, error: ACCOUNT_ERRORS.failed };
  return change(
    "address",
    (call) => deleteAddress(call, parsed.data),
    "Address deleted.",
  );
}

export async function makeDefaultAddress(
  id: unknown,
): Promise<AccountActionResult> {
  const parsed = addressId.safeParse(id);
  if (!parsed.success) return { ok: false, error: ACCOUNT_ERRORS.failed };
  return change(
    "address",
    (call) => updateAddress(call, parsed.data, null, true),
    "Default address updated.",
  );
}
