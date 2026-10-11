"use client";

import { useConsent } from "@/lib/consent/client";

// US "Do Not Sell or Share" control. Opting out turns off marketing (ad
// pixels, Klaviyo and Attentive tags) and sale of data. Only for the
// opt-out model: where marketing needs opt-in, the toggle would read as
// "unchecked means allowed", so the cookie settings are the only control.
export function PrivacyChoices() {
  const { ready, model, state, setSaleOptOut, openPreferences } = useConsent();

  if (!ready) return <p>Loading your choices…</p>;

  if (model !== "optOut") {
    return (
      <section aria-labelledby="cookie-settings-title">
        <h2 id="cookie-settings-title">Cookie settings</h2>
        <p>Marketing and analytics stay off unless you turn them on.</p>
        <p>
          <button type="button" onClick={openPreferences}>
            Manage cookie settings
          </button>
        </p>
      </section>
    );
  }

  const optedOut = !state.saleOfData;

  return (
    <section aria-labelledby="sale-opt-out-title">
      <h2 id="sale-opt-out-title">Sale and sharing of personal information</h2>
      {state.gpc && (
        <p role="status">
          <strong>Opt-Out Request Honored</strong>. Your browser&apos;s Global
          Privacy Control signal opted you out.
        </p>
      )}
      <p>
        <label>
          <input
            type="checkbox"
            checked={optedOut}
            disabled={state.gpc}
            onChange={(event) => setSaleOptOut(event.target.checked)}
          />{" "}
          Do not sell or share my personal information
        </label>
      </p>
      {!state.gpc && optedOut && state.decided && (
        <p role="status">You have opted out.</p>
      )}
      <p>
        <button type="button" onClick={openPreferences}>
          Manage all cookie settings
        </button>
      </p>
    </section>
  );
}
