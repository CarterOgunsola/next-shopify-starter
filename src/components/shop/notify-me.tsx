"use client";

import { useActionState, useEffect, useId, useRef } from "react";
import { BRAND } from "@/lib/brand";
import {
  marketingOptIn as optInText,
  PLACEHOLDER_MARKER,
} from "@/lib/commerce/compliance";
import { notifyWhenBackInStock } from "@/lib/marketing/actions";
import type { BackInStockState } from "@/lib/marketing/back-in-stock-shared";
import { HONEYPOT_FIELD } from "@/lib/marketing/newsletter-shared";

// "Notify me" for a sold-out variant: one email when it's back. Marketing
// email is a separate, unticked choice.
export function NotifyMe({
  variantId,
  variantLabel,
  marketingOptIn = false,
}: {
  variantId: string;
  // Named in the form's label when the product has options.
  variantLabel: string | null;
  // Offer the marketing opt-in (there's a list to add them to).
  marketingOptIn?: boolean;
}) {
  const id = useId();
  const [state, action, pending] = useActionState<BackInStockState, FormData>(
    notifyWhenBackInStock,
    { status: "idle" },
  );
  const status = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (state.status !== "idle") status.current?.focus();
  }, [state]);

  if (state.status === "success") {
    return (
      <p ref={status} tabIndex={-1} role="status">
        {state.message}
      </p>
    );
  }
  const email = state.status === "error" ? (state.email ?? "") : "";
  // Only an error about the address marks the field.
  const emailError = state.status === "error" && state.field === "email";
  const optIn = optInText(BRAND.name);

  return (
    <form action={action} aria-labelledby={`${id}-heading`} aria-busy={pending}>
      <h3 id={`${id}-heading`}>
        Get an email when {variantLabel ? variantLabel : "it"} is back
      </h3>
      <p
        id={`${id}-status`}
        ref={status}
        tabIndex={-1}
        role={state.status === "error" ? "alert" : "status"}
      >
        {state.status === "error" ? state.message : ""}
      </p>
      <input type="hidden" name="variantId" value={variantId} />
      <p>
        <label htmlFor={`${id}-email`}>Email</label>{" "}
        {/* Keyed so a failed attempt shows what was typed after React's reset. */}
        <input
          key={`${state.status}-${email}`}
          id={`${id}-email`}
          name="email"
          type="email"
          autoComplete="email"
          required
          maxLength={254}
          defaultValue={email}
          aria-invalid={emailError || undefined}
          aria-describedby={emailError ? `${id}-status` : undefined}
        />
      </p>
      {marketingOptIn && (
        <p>
          <label>
            <input type="checkbox" name="marketing" />{" "}
            {!optIn.approved && <strong>[{PLACEHOLDER_MARKER}] </strong>}
            {optIn.text}
          </label>{" "}
          <a href="/privacy">Privacy policy</a>
        </p>
      )}
      <p hidden>
        <label>
          Website
          <input
            name={HONEYPOT_FIELD}
            tabIndex={-1}
            autoComplete="off"
            defaultValue=""
          />
        </label>
      </p>
      <button type="submit" disabled={pending}>
        {pending ? "Sending…" : "Notify me"}
      </button>
    </form>
  );
}
