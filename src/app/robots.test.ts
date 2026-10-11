import { describe, expect, it } from "vitest";
import robots from "./robots";

describe("robots.txt", () => {
  it("keeps crawlers out of private and duplicate shop URLs", () => {
    const { rules } = robots();
    const disallow = (Array.isArray(rules) ? rules[0] : rules).disallow;
    expect(disallow).toEqual(
      expect.arrayContaining([
        "/cart",
        "/account",
        "/search",
        "/discount/",
        "/api/",
        "/checkout",
        "/policies/",
        "/collections/*sort_by*",
        "/collections/*filter*",
      ]),
    );
  });
});
