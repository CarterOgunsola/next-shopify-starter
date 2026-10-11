import { describe, expect, it } from "vitest";
import {
  COOKIE_NAMES,
  DEFAULT_COOKIE_PREFIX,
  cookieNames,
  cookiePrefix,
} from "./cookie-names";

describe("cookie names", () => {
  it("share the default prefix when none is set", () => {
    expect(cookiePrefix(undefined)).toBe(DEFAULT_COOKIE_PREFIX);
    expect(cookiePrefix("")).toBe(DEFAULT_COOKIE_PREFIX);
    expect(COOKIE_NAMES).toEqual({
      cart: "store_cart",
      customer: "store_customer",
      visitorConsent: "store_vc",
      country: "store_country",
      consent: "store_consent",
    });
  });

  it("take a configured prefix, trimmed", () => {
    expect(cookiePrefix(" acme_\n")).toBe("acme_");
    expect(cookieNames("acme-").cart).toBe("acme-cart");
  });

  it("fall back to the default for a prefix that isn't a safe cookie name", () => {
    for (const bad of [
      "_shopify_",
      "a b",
      "a;b",
      "1abc",
      "a=b",
      "x".repeat(30),
    ])
      expect(cookiePrefix(bad)).toBe(DEFAULT_COOKIE_PREFIX);
  });
});
