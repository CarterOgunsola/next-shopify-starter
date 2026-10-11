import { describe, expect, it } from "vitest";
import {
  checkoutHosts,
  contentSecurityPolicy,
  securityHeaders,
} from "./headers";

const directive = (csp: string, name: string) =>
  csp
    .split("; ")
    .find((d) => d.startsWith(`${name} `))
    ?.split(" ")
    .slice(1) ?? [];

describe("contentSecurityPolicy", () => {
  const csp = contentSecurityPolicy({ dev: false });

  it("allows our vendors' scripts and nothing else off-site", () => {
    expect(directive(csp, "script-src")).toEqual(
      expect.arrayContaining([
        "'self'",
        "https://www.googletagmanager.com",
        "https://*.klaviyo.com",
        "https://cdn.attn.tv",
      ]),
    );
  });

  it("only allows eval in development", () => {
    expect(directive(csp, "script-src")).not.toContain("'unsafe-eval'");
    expect(
      directive(contentSecurityPolicy({ dev: true }), "script-src"),
    ).toContain("'unsafe-eval'");
  });

  it("allows Shopify's storefront scripts and analytics endpoint", () => {
    expect(directive(csp, "script-src")).toContain("https://cdn.shopify.com");
    expect(directive(csp, "connect-src")).toContain(
      "https://monorail-edge.shopifysvc.com",
    );
  });

  it("plays product video from Shopify's CDN only", () => {
    expect(directive(csp, "media-src")).toEqual([
      "'self'",
      "https://cdn.shopify.com",
    ]);
  });

  it("locks down framing, plugins, base and forms", () => {
    expect(directive(csp, "frame-ancestors")).toEqual(["'none'"]);
    expect(directive(csp, "object-src")).toEqual(["'none'"]);
    expect(directive(csp, "base-uri")).toEqual(["'self'"]);
    // Forms post to this site, which may redirect on to Shopify checkout
    // or its customer account sign-in and sign-out.
    // No wildcard: the store's own checkout hosts are added from the env.
    expect(directive(csp, "form-action")).toEqual([
      "'self'",
      "https://shop.app",
      "https://shopify.com",
    ]);
  });
});

describe("securityHeaders", () => {
  it("ships the CSP as report-only", () => {
    const keys = securityHeaders({ dev: false }).map((h) => h.key);
    expect(keys).toContain("Content-Security-Policy-Report-Only");
    expect(keys).not.toContain("Content-Security-Policy");
  });

  it("lets forms post on to the store's checkout and Shop Pay", () => {
    const env = {
      SHOPIFY_STORE_DOMAIN: "synthetic-store.myshopify.com",
      SHOPIFY_CHECKOUT_DOMAIN: "checkout.example.com",
    };
    expect(checkoutHosts(env)).toEqual([
      "https://synthetic-store.myshopify.com",
      "https://checkout.example.com",
    ]);
    const header = securityHeaders({ dev: false, env })[0].value;
    expect(directive(header, "form-action")).toEqual([
      "'self'",
      "https://synthetic-store.myshopify.com",
      "https://checkout.example.com",
      "https://shop.app",
      "https://shopify.com",
    ]);
  });

  it("won't enforce without the checkout domain", () => {
    expect(() =>
      securityHeaders({
        dev: false,
        enforce: true,
        env: { SHOPIFY_STORE_DOMAIN: "synthetic-store.myshopify.com" },
      }),
    ).toThrow(/SHOPIFY_CHECKOUT_DOMAIN/);
  });

  it("upgrades insecure requests, except for development and plain-HTTP test servers", () => {
    expect(contentSecurityPolicy({ dev: false })).toContain(
      "upgrade-insecure-requests",
    );
    expect(contentSecurityPolicy({ dev: true })).not.toContain(
      "upgrade-insecure-requests",
    );
    expect(contentSecurityPolicy({ dev: false, upgrade: false })).not.toContain(
      "upgrade-insecure-requests",
    );
  });

  it("enforces the same policy with CSP_ENFORCE", () => {
    const env = {
      SHOPIFY_STORE_DOMAIN: "synthetic-store.myshopify.com",
      SHOPIFY_CHECKOUT_DOMAIN: "checkout.example.com",
    };
    const enforced = securityHeaders({ dev: false, enforce: true, env });
    const keys = enforced.map((h) => h.key);
    expect(keys).toContain("Content-Security-Policy");
    expect(keys).not.toContain("Content-Security-Policy-Report-Only");
    expect(
      enforced.find((h) => h.key === "Content-Security-Policy")?.value,
    ).toBe(contentSecurityPolicy({ dev: false, checkout: checkoutHosts(env) }));
  });

  it("allows inline scripts only for what Next can't hash, and no hashes or nonces", () => {
    const script = directive(
      contentSecurityPolicy({ dev: false }),
      "script-src",
    );
    // A hash or nonce would switch 'unsafe-inline' off for Next's inline
    // flight scripts (see headers.ts).
    expect(script).toContain("'unsafe-inline'");
    expect(script.some((s) => /^'(sha\d+|nonce)-/.test(s))).toBe(false);
  });
});
