import { describe, expect, it } from "vitest";
import { fromC15t, policyFor } from "./c15t";

describe("fromC15t", () => {
  it("maps c15t categories onto ours", () => {
    expect(
      fromC15t({ experience: true, measurement: false, marketing: true }),
    ).toEqual({
      necessary: true,
      preferences: true,
      analytics: false,
      marketing: true,
    });
  });

  it("treats missing categories as denied", () => {
    expect(fromC15t({})).toEqual({
      necessary: true,
      preferences: false,
      analytics: false,
      marketing: false,
    });
  });
});

describe("policyFor", () => {
  it("shows a banner for opt-in and none for the US opt-out model", () => {
    expect(policyFor("optIn")).toMatchObject({
      consent: { model: "opt-in", gpc: true },
      ui: { mode: "banner" },
    });
    expect(policyFor("optOut")).toMatchObject({
      consent: { model: "opt-out", gpc: true },
      ui: { mode: "none" },
    });
  });
});
