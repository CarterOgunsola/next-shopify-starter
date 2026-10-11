"use client";

import { BRAND } from "@/lib/brand";
import { useActionState, useEffect, useId, useRef } from "react";
import { track } from "@/lib/analytics/track";
import { subscribeToNewsletter } from "@/lib/marketing/actions";
import { klaviyoIdentify } from "@/lib/marketing/klaviyo-browser";
import {
  HONEYPOT_FIELD,
  type SignupState,
} from "@/lib/marketing/newsletter-shared";

const initialState: SignupState = { status: "idle" };

// Our own form instead of a Klaviyo embed: embeds don't re-render after
// client-side navigation. Submitting is the visitor's consent to email
// marketing, so the form itself isn't consent-gated.
export function NewsletterSignup({ source }: { source: string }) {
  const [state, formAction, pending] = useActionState(
    subscribeToNewsletter,
    initialState,
  );
  // Read from the submitted form: on success the input is gone before the
  // effect runs.
  const submittedEmail = useRef("");
  const id = useId();

  const submit = (form: FormData) => {
    submittedEmail.current = String(form.get("email") ?? "").trim();
    formAction(form);
  };

  useEffect(() => {
    if (state.status !== "success") return;
    track("newsletter_signup", { source, channels: ["email"] });
    if (submittedEmail.current) klaviyoIdentify(submittedEmail.current);
  }, [state, source]);

  if (state.status === "success") {
    return <p role="status">Thanks for signing up.</p>;
  }

  return (
    <form action={submit} aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`}>Get updates from {BRAND.name}</h2>
      <input type="hidden" name="source" value={source} />
      <div hidden>
        <label>
          Leave this empty
          <input
            type="text"
            name={HONEYPOT_FIELD}
            tabIndex={-1}
            autoComplete="off"
          />
        </label>
      </div>
      <label htmlFor={`${id}-email`}>Email</label>{" "}
      <input
        id={`${id}-email`}
        type="email"
        name="email"
        autoComplete="email"
        required
        aria-describedby={state.status === "error" ? `${id}-error` : undefined}
      />{" "}
      <button type="submit" disabled={pending}>
        {pending ? "Signing up…" : "Sign up"}
      </button>
      {state.status === "error" && (
        <p id={`${id}-error`} role="alert">
          {state.message}
        </p>
      )}
    </form>
  );
}
