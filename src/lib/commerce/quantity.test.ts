import { describe, expect, it } from "vitest";
import { clampQuantity, quantityBounds } from "./quantity";

describe("quantity", () => {
  it("defaults to 1 through 100", () => {
    expect(quantityBounds(undefined)).toEqual({ min: 1, step: 1, max: 100 });
    expect(clampQuantity(0, undefined)).toBe(1);
    expect(clampQuantity(250, undefined)).toBe(100);
    expect(clampQuantity(Number.NaN, undefined)).toBe(1);
  });

  it("follows a quantity rule", () => {
    const rule = { min: 6, increment: 6, max: 30 };
    expect(clampQuantity(1, rule)).toBe(6);
    expect(clampQuantity(10, rule)).toBe(12);
    expect(clampQuantity(31, rule)).toBe(30);
  });
});
