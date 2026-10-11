import { afterEach, describe, expect, it, vi } from "vitest";
import { applyGpc, defaultConsent } from "@/lib/consent/policy";
import { publishConsent, resetConsentSignal } from "@/lib/consent/signal";
import { bridgeConsent } from "./storefront-analytics";

const optOut = defaultConsent({ model: "optOut", gpc: false });
const optIn = defaultConsent({ model: "optIn", gpc: false });

function stubPrivacy(setTrackingConsent: (...args: unknown[]) => unknown) {
  vi.stubGlobal("window", {
    Shopify: { customerPrivacy: { setTrackingConsent } },
  });
}

afterEach(() => {
  resetConsentSignal();
  vi.unstubAllGlobals();
});

describe("bridgeConsent", () => {
  it("hands Shopify the saved choice once, then each change once", async () => {
    const set = vi.fn(async (_consent: unknown) => {});
    stubPrivacy(set);
    publishConsent(optOut);
    await bridgeConsent();
    expect(set).toHaveBeenCalledTimes(1);
    publishConsent(optIn);
    expect(set).toHaveBeenCalledTimes(2);
    expect(set.mock.calls[1][0]).toMatchObject({ marketing: false });
  });

  it("works with Shopify's callback form", async () => {
    const set = vi.fn((_consent: unknown, done: () => void) => {
      done();
    });
    stubPrivacy(set as (...args: unknown[]) => unknown);
    publishConsent(optOut);
    await expect(bridgeConsent()).resolves.toBeUndefined();
  });

  it("stops listening when the first hand-off fails", async () => {
    const set = vi.fn(async () => {
      throw new Error("blocked");
    });
    stubPrivacy(set);
    publishConsent(optOut);
    await expect(bridgeConsent()).rejects.toThrow("blocked");
    publishConsent(optIn);
    expect(set).toHaveBeenCalledTimes(1);
  });

  describe("before the visitor decides", () => {
    const acceptAll = {
      ...optIn,
      preferences: true,
      analytics: true,
      marketing: true,
      saleOfData: true,
      decided: true,
    };
    const rejectAll = { ...optIn, decided: true };
    // Whether setup has resolved (Hydrogen then delivers or discards the
    // events it held).
    const settled = (setup: Promise<void>) =>
      Promise.race([
        setup.then(() => true),
        new Promise((resolve) => setTimeout(() => resolve(false), 20)),
      ]);

    it("waits in an opt-in region, then hands over an accept", async () => {
      const set = vi.fn(async (_consent: unknown) => {});
      stubPrivacy(set);
      publishConsent(optIn);
      const setup = bridgeConsent();
      expect(await settled(setup)).toBe(false);
      expect(set).not.toHaveBeenCalled();
      publishConsent(acceptAll);
      expect(await settled(setup)).toBe(true);
      expect(set).toHaveBeenCalledTimes(1);
      expect(set.mock.calls[0][0]).toMatchObject({
        analytics: true,
        marketing: true,
      });
    });

    it("hands over a reject, so Hydrogen discards what it held", async () => {
      const set = vi.fn(async (_consent: unknown) => {});
      stubPrivacy(set);
      publishConsent(optIn);
      const setup = bridgeConsent();
      publishConsent(rejectAll);
      expect(await settled(setup)).toBe(true);
      expect(set.mock.calls[0][0]).toMatchObject({
        analytics: false,
        marketing: false,
      });
    });

    it("never settles without a decision, so nothing is sent", async () => {
      const set = vi.fn(async (_consent: unknown) => {});
      stubPrivacy(set);
      publishConsent(optIn);
      const setup = bridgeConsent();
      // A change that still isn't a decision (the region resolved, say).
      publishConsent({ ...optIn });
      expect(await settled(setup)).toBe(false);
      expect(set).not.toHaveBeenCalled();
    });

    it("settles at once in an opt-out region", async () => {
      const set = vi.fn(async (_consent: unknown) => {});
      stubPrivacy(set);
      publishConsent(optOut);
      expect(await settled(bridgeConsent())).toBe(true);
      expect(set.mock.calls[0][0]).toMatchObject({ analytics: true });
    });

    it("under GPC, never hands Shopify analytics, marketing or sale of data, even after Accept all", async () => {
      const set = vi.fn(async (_consent: unknown) => {});
      stubPrivacy(set);
      // GPC denies analytics too: its default doesn't settle anything.
      publishConsent(defaultConsent({ model: "optOut", gpc: true }));
      const setup = bridgeConsent();
      expect(await settled(setup)).toBe(false);
      publishConsent(applyGpc({ ...acceptAll, gpc: true }));
      expect(await settled(setup)).toBe(true);
      expect(set.mock.calls[0][0]).toMatchObject({
        analytics: false,
        marketing: false,
        sale_of_data: false,
      });
    });
  });
});
