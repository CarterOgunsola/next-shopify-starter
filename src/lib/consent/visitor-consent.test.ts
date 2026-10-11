import { describe, expect, it } from "vitest";
import { defaultConsent } from "./policy";
import {
  decodeVisitorConsent,
  encodeVisitorConsent,
  visitorConsentCookie,
} from "./visitor-consent";

describe("visitor consent cookie", () => {
  it("round-trips a choice", () => {
    const state = {
      ...defaultConsent({ model: "optOut", gpc: false }),
      marketing: false,
      saleOfData: false,
    };
    expect(encodeVisitorConsent(state)).toBe("a1m0p1s0");
    expect(decodeVisitorConsent("a1m0p1s0")).toEqual({
      analytics: true,
      marketing: false,
      preferences: true,
      saleOfData: false,
    });
    expect(visitorConsentCookie(state)).toMatch(/^store_vc=a1m0p1s0; Path=\//);
  });

  it("treats anything else as no stated choice", () => {
    for (const value of [undefined, "", "a1m0p1", "a2m0p1s0", "a1m0p1s0x"]) {
      expect(decodeVisitorConsent(value)).toBeUndefined();
    }
  });
});
