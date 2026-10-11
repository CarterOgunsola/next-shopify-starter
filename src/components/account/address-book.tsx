"use client";

import {
  Fragment,
  useActionState,
  useEffect,
  useId,
  useRef,
  useState,
  useTransition,
} from "react";
import type { AccountActionResult, CustomerAddress } from "@/lib/commerce";
import {
  COUNTRIES,
  type CountryCode,
  isCountry,
  isZoneOf,
  ZONES,
} from "@/lib/commerce/zones";
import { hasFieldErrors, useFocusFirstInvalid } from "./focus-first-invalid";
import {
  makeDefaultAddress,
  removeAddress,
  saveAddress,
} from "@/lib/commerce/account.actions";

// The customer's saved addresses: add, edit, delete and choose the default.
// Every outcome is announced in one status line, which takes focus after a
// change, so keyboard and screen reader users land somewhere sensible.

export function AddressBook({ addresses }: { addresses: CustomerAddress[] }) {
  const [editing, setEditing] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<AccountActionResult | null>(null);
  const [pending, startTransition] = useTransition();
  const status = useRef<HTMLParagraphElement>(null);
  // Where focus goes once the buttons have swapped: "Yes, delete" when a
  // delete asks for confirmation, and back to Delete or Edit when the
  // customer backs out, so focus is never left on a button that's gone.
  const list = useRef<HTMLUListElement>(null);
  const focusNext = useRef<string | null>(null);

  // The outcome takes focus, except when fields are marked: then the form
  // focuses its first invalid field (AddressForm).
  useEffect(() => {
    if (outcome && !hasFieldErrors(outcome)) status.current?.focus();
  }, [outcome]);

  // After every render: the swap has happened by then.
  useEffect(() => {
    if (!focusNext.current) return;
    list.current
      ?.querySelector<HTMLElement>(`[data-focus-key="${focusNext.current}"]`)
      ?.focus();
    focusNext.current = null;
  });

  const run = (action: () => Promise<AccountActionResult>) =>
    startTransition(async () => {
      setConfirming(null);
      setOutcome(await action());
    });

  return (
    <section aria-labelledby="addresses-heading" aria-busy={pending}>
      <h2 id="addresses-heading">Saved addresses</h2>
      <p
        ref={status}
        tabIndex={-1}
        role={outcome && !outcome.ok ? "alert" : "status"}
      >
        {outcome ? (outcome.ok ? outcome.message : outcome.error) : ""}
        {outcome && !outcome.ok && outcome.signIn && (
          <>
            {" "}
            <a href={outcome.signIn}>Sign in</a>
          </>
        )}
      </p>
      {addresses.length === 0 ? (
        <p>No saved addresses yet.</p>
      ) : (
        <ul aria-label="Addresses" ref={list}>
          {addresses.map((address) => (
            <li key={address.id}>
              <address>
                {address.formatted.map((line, index) => (
                  <span key={index}>
                    {line}
                    <br />
                  </span>
                ))}
              </address>
              {address.isDefault && <p>Default address</p>}
              {editing === address.id ? (
                <AddressForm
                  address={address}
                  onDone={(result) => {
                    setOutcome(result);
                    if (result.ok) setEditing(null);
                  }}
                  onCancel={() => {
                    setEditing(null);
                    focusNext.current = `edit:${address.id}`;
                  }}
                />
              ) : (
                <p>
                  <button
                    type="button"
                    data-focus-key={`edit:${address.id}`}
                    onClick={() => setEditing(address.id)}
                    aria-label={`Edit ${label(address)}`}
                  >
                    Edit
                  </button>{" "}
                  {!address.isDefault && (
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => run(() => makeDefaultAddress(address.id))}
                      aria-label={`Make ${label(address)} the default`}
                    >
                      Make default
                    </button>
                  )}{" "}
                  {confirming === address.id ? (
                    <>
                      <button
                        type="button"
                        data-focus-key={`confirm:${address.id}`}
                        disabled={pending}
                        onClick={() => run(() => removeAddress(address.id))}
                        aria-label={`Yes, delete ${label(address)}`}
                      >
                        Yes, delete
                      </button>{" "}
                      <button
                        type="button"
                        onClick={() => {
                          setConfirming(null);
                          focusNext.current = `delete:${address.id}`;
                        }}
                        aria-label={`Keep ${label(address)}`}
                      >
                        Keep it
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      data-focus-key={`delete:${address.id}`}
                      disabled={pending}
                      onClick={() => {
                        setConfirming(address.id);
                        focusNext.current = `confirm:${address.id}`;
                      }}
                      aria-label={`Delete ${label(address)}`}
                    >
                      Delete
                    </button>
                  )}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
      <h2 id="add-address-heading">Add an address</h2>
      <AddressForm
        key={addresses.length}
        address={null}
        onDone={(result) => setOutcome(result)}
      />
    </section>
  );
}

// An address as buttons name it: its street line.
const label = (address: CustomerAddress) => address.formatted[1] ?? "address";

function AddressForm({
  address,
  onDone,
  onCancel,
}: {
  address: CustomerAddress | null;
  onDone: (result: AccountActionResult) => void;
  onCancel?: () => void;
}) {
  const id = useId();
  // An edit form opens in place of the Edit button: focus its first field.
  const formRef = useRef<HTMLFormElement>(null);
  const editing = address !== null;
  useEffect(() => {
    if (editing)
      formRef.current
        ?.querySelector<HTMLElement>("input:not([type=hidden])")
        ?.focus();
  }, [editing]);
  const [result, action, pending] = useActionState<
    AccountActionResult | null,
    FormData
  >(async (previous, form) => {
    const next = await saveAddress(previous, form);
    onDone(next);
    return next;
  }, null);
  // Bumped in the same render as each new result, to rebuild the fields
  // with it (see the Fragment below).
  const [round, setRound] = useState({ result, count: 0 });
  if (round.result !== result) setRound({ result, count: round.count + 1 });
  const errors = result && !result.ok ? (result.fieldErrors ?? {}) : {};
  // After a failed save, what the customer typed (React resets the fields
  // to these defaults once the action finishes).
  const submitted = result && !result.ok ? result.values : undefined;
  const knownCountry = (code: string | null | undefined) =>
    code && isCountry(code) ? code : undefined;
  const [country, setCountry] = useState<CountryCode>(
    knownCountry(submitted?.countryCode) ??
      knownCountry(address?.countryCode) ??
      "US",
  );
  // The saved or submitted state, if it belongs to the country shown.
  const zoneFor = (code: string | null | undefined) =>
    code && isZoneOf(country, code) ? code : "";
  const zone = submitted
    ? zoneFor(submitted.zoneCode)
    : zoneFor(address?.zoneCode);
  useFocusFirstInvalid(formRef, result);
  const field = (
    name: string,
    label: string,
    options: {
      autoComplete?: string;
      required?: boolean;
      type?: string;
      hint?: string;
    } = {},
  ) => {
    const describedBy = [
      options.hint && `${id}-${name}-hint`,
      errors[name] && `${id}-${name}-error`,
    ]
      .filter(Boolean)
      .join(" ");
    const saved = address?.[name as keyof CustomerAddress];
    const value = submitted ? (submitted[name] ?? "") : saved;
    return (
      <p>
        <label htmlFor={`${id}-${name}`}>{label}</label>{" "}
        <input
          id={`${id}-${name}`}
          name={name}
          defaultValue={typeof value === "string" ? value : ""}
          autoComplete={options.autoComplete}
          required={options.required}
          maxLength={255}
          type={options.type}
          aria-invalid={errors[name] ? true : undefined}
          aria-describedby={describedBy || undefined}
        />
        {options.hint && <span id={`${id}-${name}-hint`}> {options.hint}</span>}
        {errors[name] && (
          <span id={`${id}-${name}-error`}> {errors[name]}</span>
        )}
      </p>
    );
  };
  return (
    <form
      ref={formRef}
      action={action}
      aria-label={address ? `Edit ${label(address)}` : "New address"}
      aria-busy={pending}
    >
      {address && <input type="hidden" name="id" value={address.id} />}
      {/* Rebuilt after each save, so every field (selects included) takes
          the submitted value as its default; React's reset after the
          action then keeps it rather than reverting to the first option
          or the saved address. */}
      <Fragment key={round.count}>
        {field("firstName", "First name", { autoComplete: "given-name" })}
        {field("lastName", "Last name", { autoComplete: "family-name" })}
        {field("company", "Company (optional)", {
          autoComplete: "organization",
        })}
        {field("address1", "Street address", {
          autoComplete: "address-line1",
          required: true,
        })}
        {field("address2", "Apartment, suite (optional)", {
          autoComplete: "address-line2",
        })}
        {field("city", "City", {
          autoComplete: "address-level2",
          required: true,
        })}
        {field("zip", "ZIP or postal code", { autoComplete: "postal-code" })}
        <p>
          <label htmlFor={`${id}-countryCode`}>Country</label>{" "}
          <select
            id={`${id}-countryCode`}
            name="countryCode"
            defaultValue={country}
            onChange={(event) => setCountry(event.target.value as CountryCode)}
            aria-invalid={errors.countryCode ? true : undefined}
            aria-describedby={
              errors.countryCode ? `${id}-countryCode-error` : undefined
            }
          >
            {COUNTRIES.map(([code, name]) => (
              <option key={code} value={code}>
                {name}
              </option>
            ))}
          </select>
          {errors.countryCode && (
            <span id={`${id}-countryCode-error`}> {errors.countryCode}</span>
          )}
        </p>
        <p>
          <label htmlFor={`${id}-zoneCode`}>{ZONES[country].label}</label>{" "}
          {/* New options when the country changes. */}
          <select
            key={country}
            id={`${id}-zoneCode`}
            name="zoneCode"
            required
            autoComplete="address-level1"
            defaultValue={zone}
            aria-invalid={errors.zoneCode ? true : undefined}
            aria-describedby={
              errors.zoneCode ? `${id}-zoneCode-error` : undefined
            }
          >
            <option value="">Choose…</option>
            {ZONES[country].zones.map(([code, name]) => (
              <option key={code} value={code}>
                {name}
              </option>
            ))}
          </select>
          {errors.zoneCode && (
            <span id={`${id}-zoneCode-error`}> {errors.zoneCode}</span>
          )}
        </p>
        {field("phoneNumber", "Phone (optional)", {
          autoComplete: "tel",
          type: "tel",
          hint: "Outside the US and Canada, start with the country code (+44 …).",
        })}
        {!address?.isDefault && (
          <p>
            <label>
              <input
                type="checkbox"
                name="default"
                defaultChecked={submitted?.default === "on"}
              />{" "}
              Make this the default address
            </label>
          </p>
        )}
      </Fragment>
      <p>
        <button type="submit" disabled={pending}>
          {pending ? "Saving…" : address ? "Save address" : "Add address"}
        </button>{" "}
        {onCancel && (
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
        )}
      </p>
    </form>
  );
}
