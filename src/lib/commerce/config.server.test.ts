import { describe, expect, it } from "vitest";
import { CommerceConfigError, parseCommerceEnv } from "./config.server";

describe("parseCommerceEnv", () => {
  it("reads the store domain and private token", () => {
    expect(
      parseCommerceEnv({
        SHOPIFY_STORE_DOMAIN: "synthetic-store.myshopify.com",
        SHOPIFY_PRIVATE_ACCESS_TOKEN: "synthetic-token",
      }),
    ).toEqual({
      storeDomain: "synthetic-store.myshopify.com",
      privateToken: "synthetic-token",
    });
  });

  it("names missing variables", () => {
    expect(() => parseCommerceEnv({ SHOPIFY_STORE_DOMAIN: "" })).toThrow(
      new CommerceConfigError([
        "SHOPIFY_STORE_DOMAIN is missing",
        "SHOPIFY_PRIVATE_ACCESS_TOKEN is missing",
      ]),
    );
  });

  it("explains a bad value without repeating it", () => {
    const run = () =>
      parseCommerceEnv({
        SHOPIFY_STORE_DOMAIN: "https://synthetic-store.myshopify.com/",
        SHOPIFY_PRIVATE_ACCESS_TOKEN: "synthetic-token",
      });
    expect(run).toThrow(
      /SHOPIFY_STORE_DOMAIN should be a \*\.myshopify\.com host/,
    );
    expect(run).not.toThrow(/synthetic-store/);
  });
});
