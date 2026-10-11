import { afterEach, describe, expect, it, vi } from "vitest";
import { defaultConsent } from "./policy";
import {
  onConsent,
  publishConsent,
  resetConsentSignal,
  whenConsentKnown,
} from "./signal";

afterEach(resetConsentSignal);

describe("consent signal", () => {
  it("resolves once consent is known and reports changes", async () => {
    const pending = whenConsentKnown();
    const listener = vi.fn();
    onConsent(listener);
    const state = defaultConsent({ model: "optOut", gpc: false });
    publishConsent(state);
    expect(await pending).toBe(state);
    publishConsent({ ...state, marketing: false });
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("tells a late subscriber the current consent right away", () => {
    publishConsent(defaultConsent({ model: "optIn", gpc: false }));
    const listener = vi.fn();
    onConsent(listener);
    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({ analytics: false }),
    );
  });
});
