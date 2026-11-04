import { afterEach, describe, expect, it, vi } from "vitest";
import { requireProductionSiteUrl } from "./site-url-guard";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

const production = (NEXT_PUBLIC_SITE_URL?: string) => () =>
  requireProductionSiteUrl({ VERCEL_ENV: "production", NEXT_PUBLIC_SITE_URL });

describe("the site URL on a production build", () => {
  it("fails the build when it isn't set, naming the variable and the fix", () => {
    for (const value of [undefined, "", "  "]) {
      expect(production(value)).toThrow(
        /^NEXT_PUBLIC_SITE_URL isn't set\. .*Vercel project's Production environment variables, then redeploy\.$/,
      );
    }
  });

  it("fails the build when it isn't https", () => {
    expect(production("http://shop.example")).toThrow(/isn't https/);
  });

  it("fails the build when it points at this machine", () => {
    for (const value of [
      "https://localhost",
      "https://LOCALHOST:3000",
      "https://127.0.0.1:4747",
      "https://[::1]",
      "https://store.localhost:4747",
    ]) {
      expect(production(value), value).toThrow(/points at this machine/);
    }
  });

  it("fails the build when it isn't a URL", () => {
    expect(production("shop.example")).toThrow(/isn't a URL/);
  });

  it("passes the site's public https URL", () => {
    expect(production("https://shop.example")).not.toThrow();
    expect(production(" https://shop-preview.vercel.app/ ")).not.toThrow();
  });

  it("checks Workers Builds builds and pnpm cf:deploy on Cloudflare", () => {
    for (const env of [{ WORKERS_CI: "1" }, { CF_DEPLOY: "1" }]) {
      expect(() =>
        requireProductionSiteUrl({
          ...env,
          HOSTING: "cloudflare",
          NEXT_PUBLIC_SITE_URL: "http://localhost:4747",
        }),
      ).toThrow(/build variable in Workers Builds, or in the environment/);
      expect(() =>
        requireProductionSiteUrl({
          ...env,
          NEXT_PUBLIC_SITE_URL: "https://shop.example",
        }),
      ).not.toThrow();
    }
  });

  it("leaves previews, local builds, CI and the tests alone", () => {
    for (const env of [
      {},
      { VERCEL_ENV: "preview" },
      { VERCEL_ENV: "development" },
      // pnpm cf:build on its own: CI's build check and pnpm cf:preview.
      { HOSTING: "cloudflare" },
      { CI: "true", HOSTING: "cloudflare" },
    ]) {
      expect(() =>
        requireProductionSiteUrl({
          ...env,
          NEXT_PUBLIC_SITE_URL: "http://localhost:4747",
        }),
      ).not.toThrow();
    }
  });

  it("stops a production build when next.config.ts loads", async () => {
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "");
    await expect(import("../../next.config")).rejects.toThrow(
      /NEXT_PUBLIC_SITE_URL isn't set/,
    );
  });
});
