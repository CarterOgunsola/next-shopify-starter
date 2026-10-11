import { describe, expect, it } from "vitest";
import { formatMoney } from "./money";

describe("formatMoney", () => {
  it("formats Shopify decimal strings in the given currency", () => {
    expect(formatMoney({ amount: "29.0", currencyCode: "USD" })).toBe("$29.00");
    expect(formatMoney({ amount: "1234.5", currencyCode: "USD" })).toBe(
      "$1,234.50",
    );
    expect(formatMoney({ amount: "10", currencyCode: "CAD" })).toBe("CA$10.00");
  });
});
