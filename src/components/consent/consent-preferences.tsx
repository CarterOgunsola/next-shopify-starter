"use client";

import { useEffect, useRef, type FormEvent } from "react";
import { useConsent } from "@/lib/consent/client";

// Native <dialog> with showModal(): focus is trapped and Escape closes it.
export function ConsentPreferences() {
  const { preferencesOpen, state, save, closeUI } = useConsent();
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (preferencesOpen && !dialog.open) dialog.showModal();
    if (!preferencesOpen && dialog.open) dialog.close();
  }, [preferencesOpen]);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    save({
      preferences: form.has("preferences"),
      analytics: form.has("analytics"),
      marketing: form.has("marketing"),
    });
  }

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="consent-preferences-title"
      // The page holds still behind it (globals.css) until its close event,
      // which every way of closing it fires (Escape included).
      data-lock-scroll={preferencesOpen ? "on" : undefined}
      onClose={() => {
        if (preferencesOpen) closeUI();
      }}
    >
      {/* Remount on open so the checkboxes start from the current state. */}
      {preferencesOpen && (
        <form onSubmit={onSubmit}>
          <h2 id="consent-preferences-title">Cookie preferences</h2>
          {state.gpc && (
            <p>
              Your browser sends a Global Privacy Control signal, so analytics
              and marketing cookies stay off.
            </p>
          )}
          <fieldset>
            <legend>Categories</legend>
            <p>
              <label>
                <input type="checkbox" checked disabled /> Necessary (always on)
              </label>
            </p>
            <p>
              <label>
                <input
                  type="checkbox"
                  name="preferences"
                  defaultChecked={state.preferences}
                />{" "}
                Preferences
              </label>
            </p>
            <p>
              <label>
                <input
                  type="checkbox"
                  name="analytics"
                  defaultChecked={state.analytics}
                  disabled={state.gpc}
                />{" "}
                Analytics
              </label>
            </p>
            <p>
              <label>
                <input
                  type="checkbox"
                  name="marketing"
                  defaultChecked={state.marketing}
                  disabled={state.gpc}
                />{" "}
                Marketing
              </label>
            </p>
          </fieldset>
          <button type="submit">Save choices</button>
          <button type="button" onClick={closeUI}>
            Cancel
          </button>
        </form>
      )}
    </dialog>
  );
}
