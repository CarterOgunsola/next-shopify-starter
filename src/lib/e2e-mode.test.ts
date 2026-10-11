import { describe, expect, it } from "vitest";
import { e2eMode, refuseStrayTestProxy } from "./e2e-mode";

const STORE = { SHOPIFY_STORE_DOMAIN: "synthetic-store.myshopify.com" };

describe("e2eMode", () => {
  it("is off without E2E=1", () => {
    expect(e2eMode({})).toBe(false);
    expect(e2eMode({ E2E: "true", VERCEL: "1" })).toBe(false);
  });

  it("is on for a test run against the synthetic store, CI included", () => {
    expect(e2eMode({ E2E: "1", ...STORE })).toBe(true);
    expect(e2eMode({ E2E: "1", CI: "true", ...STORE })).toBe(true);
  });

  it("refuses a deployment and a real store", () => {
    expect(() => e2eMode({ E2E: "1", VERCEL: "1", ...STORE })).toThrow();
    expect(() => e2eMode({ E2E: "1", WORKERS_CI: "1", ...STORE })).toThrow();
    expect(() =>
      e2eMode({ E2E: "1", HOSTING: "cloudflare", ...STORE }),
    ).toThrow();
    expect(() =>
      e2eMode({ E2E: "1", VERCEL_ENV: "preview", ...STORE }),
    ).toThrow();
    expect(() =>
      e2eMode({ E2E: "1", SHOPIFY_STORE_DOMAIN: "real.myshopify.com" }),
    ).toThrow();
    expect(() => e2eMode({ E2E: "1" })).toThrow();
  });
});

describe("refuseStrayTestProxy", () => {
  it("refuses Next's test interception outside a test run", () => {
    expect(() => refuseStrayTestProxy({})).not.toThrow();
    expect(() =>
      refuseStrayTestProxy({ NEXT_PRIVATE_TEST_PROXY: "true" }),
    ).toThrow();
    expect(() =>
      refuseStrayTestProxy({ NEXT_PRIVATE_TEST_PROXY: "true", ...STORE }),
    ).toThrow();
    expect(() =>
      refuseStrayTestProxy({
        NEXT_PRIVATE_TEST_PROXY: "true",
        E2E: "1",
        ...STORE,
      }),
    ).not.toThrow();
  });
});
