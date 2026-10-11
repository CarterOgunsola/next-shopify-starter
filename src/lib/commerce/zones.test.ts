import { describe, expect, it } from "vitest";
import { isZoneOf, toE164, ZONES } from "./zones";

describe("toE164", () => {
  it.each([
    ["(312) 555-0123", "US", "+13125550123"],
    ["312.555.0123", "CA", "+13125550123"],
    ["1 312 555 0123", "US", "+13125550123"],
    ["+44 20 7946 0958", "US", "+442079460958"],
    ["+44 (0)20 7946 0958", "US", "+442079460958"],
    ["+1 (312) 555-0123", "CA", "+13125550123"],
    ["", "US", ""],
  ])("reads %s (%s) as %s", (raw, country, e164) => {
    expect(toE164(raw, country)).toBe(e164);
  });

  it.each([
    ["555-0123"],
    ["call me"],
    ["+1 2"],
    ["312 555 01234 5"],
    ["012 555 0123"],
    ["112 555 0123"],
    ["+1 012 555 0123"],
    ["312 555 0123 x4"],
    ["312 555 0123 ext. 12"],
    ["312-555-0123#7"],
  ])("refuses %s", (raw) => {
    expect(toE164(raw, "US")).toBeNull();
  });
});

describe("zones", () => {
  it("match codes to their own country only", () => {
    expect(isZoneOf("US", "IL")).toBe(true);
    expect(isZoneOf("CA", "ON")).toBe(true);
    expect(isZoneOf("CA", "IL")).toBe(false);
    expect(isZoneOf("constructor", "IL")).toBe(false);
  });

  it("have unique codes per country", () => {
    for (const { zones } of Object.values(ZONES)) {
      const codes = zones.map(([code]) => code);
      expect(new Set(codes).size).toBe(codes.length);
    }
  });
});
