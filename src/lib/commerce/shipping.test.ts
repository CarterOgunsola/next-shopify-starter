import { describe, expect, it } from "vitest";
import { freeShippingProgress } from "./shipping";

const usd = (amount: string) => ({ amount, currencyCode: "USD" });

describe("freeShippingProgress", () => {
  it("shows what's left to spend, in cents", () => {
    expect(freeShippingProgress(usd("38.0"), "50.00")).toEqual({
      qualified: false,
      remaining: usd("12.00"),
      percent: 76,
    });
    expect(freeShippingProgress(usd("49.99"), "50").remaining).toEqual(
      usd("0.01"),
    );
    expect(freeShippingProgress(usd("0.1"), "0.3").remaining).toEqual(
      usd("0.20"),
    );
  });

  it("qualifies at or over the threshold", () => {
    expect(freeShippingProgress(usd("50.0"), "50.00")).toMatchObject({
      qualified: true,
      percent: 100,
    });
    expect(freeShippingProgress(usd("76.0"), "50.00").remaining).toEqual(
      usd("0.00"),
    );
  });
});
