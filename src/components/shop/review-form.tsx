"use client";

import { useActionState, useEffect, useId, useRef, useState } from "react";
import { submitReview } from "@/lib/reviews/actions";
import { REVIEW_HONEYPOT, type ReviewFormState } from "@/lib/reviews/form";

// Write a review: rating, title, review, name and email. Sent through our
// server to the review app, which checks reviews before they're published.
// Fields keep what was typed after a failed send; the outcome is announced
// and takes focus (the first invalid field, when there is one).
export function ReviewForm({ handle }: { handle: string }) {
  const id = useId();
  const [state, action, pending] = useActionState<ReviewFormState, FormData>(
    submitReview,
    { status: "idle" },
  );
  // Rebuilt with each result, so the fields take the sent values as their
  // defaults (React resets a form after its action).
  const [round, setRound] = useState({ state, count: 0 });
  if (round.state !== state) setRound({ state, count: round.count + 1 });
  const form = useRef<HTMLFormElement>(null);
  const status = useRef<HTMLParagraphElement>(null);
  const errors = state.status === "error" ? (state.fieldErrors ?? {}) : {};
  const sent = state.status === "error" ? state.values : undefined;

  useEffect(() => {
    if (state.status === "idle") return;
    const invalid = form.current?.querySelector<HTMLElement>(
      '[aria-invalid="true"]',
    );
    (invalid ?? status.current)?.focus();
  }, [state]);

  if (state.status === "sent") {
    return (
      <p ref={status} tabIndex={-1} role="status">
        {state.message}
      </p>
    );
  }

  const describedBy = (name: string, hint?: boolean) =>
    [hint && `${id}-${name}-hint`, errors[name] && `${id}-${name}-error`]
      .filter(Boolean)
      .join(" ") || undefined;
  const error = (name: string) =>
    errors[name] ? (
      <span id={`${id}-${name}-error`}> {errors[name]}</span>
    ) : null;
  const text = (
    name: "title" | "name" | "email",
    label: string,
    options: { type?: string; autoComplete?: string; maxLength: number },
  ) => (
    <p>
      <label htmlFor={`${id}-${name}`}>{label}</label>{" "}
      <input
        id={`${id}-${name}`}
        name={name}
        type={options.type ?? "text"}
        autoComplete={options.autoComplete}
        maxLength={options.maxLength}
        required
        defaultValue={sent?.[name] ?? ""}
        aria-invalid={errors[name] ? true : undefined}
        aria-describedby={describedBy(name, name === "email")}
      />
      {name === "email" && (
        <span id={`${id}-email-hint`}>
          {" "}
          For the review app to confirm your review. Not published.
        </span>
      )}
      {error(name)}
    </p>
  );

  return (
    <form
      ref={form}
      action={action}
      aria-labelledby={`${id}-heading`}
      aria-busy={pending}
    >
      <h3 id={`${id}-heading`}>Write a review</h3>
      <p
        ref={status}
        tabIndex={-1}
        role={state.status === "error" ? "alert" : "status"}
      >
        {state.status === "error" ? state.message : ""}
      </p>
      <input type="hidden" name="handle" value={handle} />
      <div key={round.count}>
        <fieldset
          aria-invalid={errors.rating ? true : undefined}
          aria-describedby={describedBy("rating")}
        >
          <legend>Rating</legend>
          {[5, 4, 3, 2, 1].map((stars) => (
            <label key={stars}>
              <input
                type="radio"
                name="rating"
                value={stars}
                required
                defaultChecked={sent?.rating === String(stars)}
              />{" "}
              {stars} {stars === 1 ? "star" : "stars"}
            </label>
          ))}
          {error("rating")}
        </fieldset>
        {text("title", "Title", { maxLength: 100 })}
        <p>
          <label htmlFor={`${id}-body`}>Review</label>{" "}
          <textarea
            id={`${id}-body`}
            name="body"
            rows={5}
            minLength={20}
            maxLength={5000}
            required
            defaultValue={sent?.body ?? ""}
            aria-invalid={errors.body ? true : undefined}
            aria-describedby={describedBy("body")}
          />
          {error("body")}
        </p>
        {text("name", "Name (shown as first name and initial)", {
          autoComplete: "name",
          maxLength: 80,
        })}
        {text("email", "Email", {
          type: "email",
          autoComplete: "email",
          maxLength: 254,
        })}
      </div>
      {/* Left empty by people; bots fill it. */}
      <p hidden>
        <label>
          Website
          <input
            name={REVIEW_HONEYPOT}
            tabIndex={-1}
            autoComplete="off"
            defaultValue=""
          />
        </label>
      </p>
      <button type="submit" disabled={pending}>
        {pending ? "Sending…" : "Send review"}
      </button>
    </form>
  );
}
