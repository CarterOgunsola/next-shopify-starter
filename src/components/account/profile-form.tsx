"use client";

import { useActionState, useEffect, useId, useRef } from "react";
import type { AccountActionResult, CustomerProfile } from "@/lib/commerce";
import { saveProfile } from "@/lib/commerce/account.actions";
import { hasFieldErrors, useFocusFirstInvalid } from "./focus-first-invalid";

// Name changes. Email is read-only: Shopify signs customers in by email, so
// it changes in Shopify's account, not here.
export function ProfileForm({
  profile,
  manageUrl,
}: {
  profile: CustomerProfile;
  manageUrl: string;
}) {
  const id = useId();
  const [result, action, pending] = useActionState<
    AccountActionResult | null,
    FormData
  >(saveProfile, null);
  const status = useRef<HTMLParagraphElement>(null);
  // After a save, focus the outcome so it's announced and the visitor knows
  // where they are.
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (result && !hasFieldErrors(result)) status.current?.focus();
  }, [result]);
  useFocusFirstInvalid(form, result);
  const fieldErrors = result && !result.ok ? (result.fieldErrors ?? {}) : {};
  // After a failed save, what the customer typed (React resets the fields
  // to these defaults once the action finishes).
  const submitted = result && !result.ok ? result.values : undefined;
  const field = (name: "firstName" | "lastName", label: string) => (
    <p>
      <label htmlFor={`${id}-${name}`}>{label}</label>{" "}
      <input
        id={`${id}-${name}`}
        name={name}
        autoComplete={name === "firstName" ? "given-name" : "family-name"}
        defaultValue={
          submitted ? (submitted[name] ?? "") : (profile[name] ?? "")
        }
        maxLength={255}
        aria-invalid={fieldErrors[name] ? true : undefined}
        aria-describedby={fieldErrors[name] ? `${id}-${name}-error` : undefined}
      />
      {fieldErrors[name] && (
        <span id={`${id}-${name}-error`}> {fieldErrors[name]}</span>
      )}
    </p>
  );
  return (
    <form
      ref={form}
      action={action}
      aria-labelledby={`${id}-heading`}
      aria-busy={pending}
    >
      <h2 id={`${id}-heading`}>Your name</h2>
      <p
        ref={status}
        tabIndex={-1}
        role={result && !result.ok ? "alert" : "status"}
      >
        {result ? (result.ok ? result.message : result.error) : ""}
        {result && !result.ok && result.signIn && (
          <>
            {" "}
            <a href={result.signIn}>Sign in</a>
          </>
        )}
      </p>
      {field("firstName", "First name")}
      {field("lastName", "Last name")}
      <p>
        Email: {profile.email ?? "none"}.{" "}
        {manageUrl && (
          <>
            To change it, use <a href={manageUrl}>your Shopify account</a>.
          </>
        )}
      </p>
      <button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save"}
      </button>
    </form>
  );
}
