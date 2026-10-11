import { describe, expect, it } from "vitest";
import { defaultConsent, modelForCountry, resolveConsent } from "./policy";

describe("modelForCountry", () => {
  it("uses opt-out for the US", () => {
    expect(modelForCountry("US")).toBe("optOut");
    expect(modelForCountry(" us ")).toBe("optOut");
  });

  it("uses opt-in for the EEA, UK and Switzerland", () => {
    for (const code of ["DE", "FR", "IE", "NO", "GB", "CH"]) {
      expect(modelForCountry(code)).toBe("optIn");
    }
  });

  it("falls back to opt-in when the country is unknown", () => {
    expect(modelForCountry(null)).toBe("optIn");
    expect(modelForCountry(undefined)).toBe("optIn");
    expect(modelForCountry("")).toBe("optIn");
  });
});

describe("defaultConsent", () => {
  it("grants everything under opt-out without GPC", () => {
    expect(defaultConsent({ model: "optOut", gpc: false })).toEqual({
      necessary: true,
      preferences: true,
      analytics: true,
      marketing: true,
      saleOfData: true,
      gpc: false,
      decided: false,
    });
  });

  it("grants only necessary under opt-in", () => {
    expect(defaultConsent({ model: "optIn", gpc: false })).toEqual({
      necessary: true,
      preferences: false,
      analytics: false,
      marketing: false,
      saleOfData: false,
      gpc: false,
      decided: false,
    });
  });

  it("turns off sale, marketing and analytics under opt-out when GPC is on", () => {
    const state = defaultConsent({ model: "optOut", gpc: true });
    expect(state).toMatchObject({
      saleOfData: false,
      marketing: false,
      analytics: false,
      preferences: true,
      gpc: true,
    });
  });
});

describe("resolveConsent", () => {
  const savedAll = {
    necessary: true as const,
    preferences: true,
    analytics: true,
    marketing: true,
  };

  it("uses region defaults when nothing is saved", () => {
    expect(resolveConsent({ saved: null, model: "optIn", gpc: false })).toEqual(
      defaultConsent({ model: "optIn", gpc: false }),
    );
  });

  it("keeps a saved choice and marks it decided", () => {
    expect(
      resolveConsent({ saved: savedAll, model: "optIn", gpc: false }),
    ).toMatchObject({ ...savedAll, saleOfData: true, decided: true });
  });

  it("does not let a saved choice override GPC", () => {
    expect(
      resolveConsent({ saved: savedAll, model: "optOut", gpc: true }),
    ).toMatchObject({
      marketing: false,
      analytics: false,
      saleOfData: false,
      preferences: true,
      decided: true,
    });
  });

  it("keeps an explicit sale opt-out even with marketing on", () => {
    expect(
      resolveConsent({
        saved: { ...savedAll, saleOfData: false },
        model: "optOut",
        gpc: false,
      }),
    ).toMatchObject({ marketing: true, saleOfData: false });
  });
});
