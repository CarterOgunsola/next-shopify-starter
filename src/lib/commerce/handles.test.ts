import { describe, expect, it } from "vitest";
import { isValidHandle } from "./handles";

describe("isValidHandle", () => {
  it("accepts Shopify handles", () => {
    expect(isValidHandle("the-complete-snowboard")).toBe(true);
    expect(isValidHandle("creatine_300g")).toBe(true);
  });

  it("rejects anything else", () => {
    for (const handle of [
      "",
      "-leading-hyphen",
      "Upper-Case",
      "has space",
      "../etc",
      "a".repeat(256),
    ]) {
      expect(isValidHandle(handle), handle).toBe(false);
    }
  });
});
