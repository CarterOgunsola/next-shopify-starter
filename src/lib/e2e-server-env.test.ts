import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { e2eServerEnv } from "../../e2e/support/server-env.mjs";
import { E2E_STORE_DOMAIN, e2eMode } from "./e2e-mode";

const root = join(import.meta.dirname, "../..");
const envExample = readFileSync(join(root, ".env.example"), "utf8");
const listed = envExample.match(/^[A-Z][A-Z0-9_]*(?==)/gm) ?? [];
const preload = join(root, "e2e/support/preload.mjs");
const importPreload = `--import ${pathToFileURL(preload).href}`;

const serverEnv = (env: Record<string, string | undefined>) =>
  e2eServerEnv({ env, envExample, port: "3100", preload });

describe("the end-to-end server's environment", () => {
  it("keeps the caller's Node options and adds the preload once", () => {
    expect(serverEnv({}).NODE_OPTIONS).toBe(importPreload);
    expect(
      serverEnv({ NODE_OPTIONS: "--max-old-space-size=6144" }).NODE_OPTIONS,
    ).toBe(`--max-old-space-size=6144 ${importPreload}`);
    const already = `--max-old-space-size=6144 ${importPreload}`;
    expect(serverEnv({ NODE_OPTIONS: already }).NODE_OPTIONS).toBe(already);
  });

  it("blanks every .env.example variable, whatever the caller set", () => {
    expect(listed.length).toBeGreaterThan(10);
    const caller = Object.fromEntries(
      listed
        .filter((key) => key !== "CSP_ENFORCE")
        .map((key) => [key, `real-${key}`]),
    );
    const unset = serverEnv({});
    const env = serverEnv(caller);
    for (const key of listed) expect(env[key], key).toBe(unset[key]);
    // Those the server doesn't set itself are empty.
    expect(env.SHOPIFY_STOREFRONT_PASSWORD).toBe("");
    expect(env.SHOPIFY_WEBHOOK_SECRET).toBe("");
    expect(env.NEXT_PUBLIC_SHOPIFY_PUBLIC_ACCESS_TOKEN).toBe("");
    expect(env.HOSTING).toBe("");
  });

  it("passes CSP_ENFORCE through only when it's set", () => {
    expect(serverEnv({ CSP_ENFORCE: "1" }).CSP_ENFORCE).toBe("1");
    expect(serverEnv({}).CSP_ENFORCE).toBe("");
  });

  it("points at the synthetic store, whatever the caller set", () => {
    const env = serverEnv({
      SHOP_ENABLED: "false",
      NEXT_PUBLIC_SITE_URL: "https://shop.example",
      SHOPIFY_STORE_DOMAIN: "real-store.myshopify.com",
      SHOPIFY_PRIVATE_ACCESS_TOKEN: "real-token",
      KLAVIYO_PRIVATE_API_KEY: "pk_real",
    });
    expect(env).toMatchObject({
      E2E: "1",
      SHOP_ENABLED: "true",
      NEXT_PUBLIC_SITE_URL: "http://127.0.0.1:3100",
      SHOPIFY_STORE_DOMAIN: E2E_STORE_DOMAIN,
      SHOPIFY_PRIVATE_ACCESS_TOKEN: "synthetic-private-token",
      KLAVIYO_PRIVATE_API_KEY: "pk_synthetic",
    });
    expect(e2eMode(env)).toBe(true);
  });

  it("keeps the rest of the caller's environment", () => {
    expect(serverEnv({ PATH: "/usr/bin" }).PATH).toBe("/usr/bin");
  });

  it("serves the tests on 127.0.0.1 and pnpm dev:synthetic on localhost", () => {
    expect(serverEnv({}).NEXT_PUBLIC_SITE_URL).toBe("http://127.0.0.1:3100");
    const dev = e2eServerEnv({
      env: { SHOPIFY_STORE_DOMAIN: "real-store.myshopify.com" },
      envExample,
      port: "4748",
      preload,
      dev: true,
    });
    // next dev only serves its scripts to localhost.
    expect(dev.NEXT_PUBLIC_SITE_URL).toBe("http://localhost:4748");
    // Otherwise the same synthetic store as the tests.
    expect({ ...dev, NEXT_PUBLIC_SITE_URL: "" }).toEqual({
      ...e2eServerEnv({ env: {}, envExample, port: "4748", preload }),
      NEXT_PUBLIC_SITE_URL: "",
    });
    expect(e2eMode(dev)).toBe(true);
  });
});
