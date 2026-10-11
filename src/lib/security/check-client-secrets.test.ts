import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

// scripts/check-client-secrets.mjs, run against a planted build in a
// temporary directory.
const SCRIPT = join(
  import.meta.dirname,
  "../../../scripts/check-client-secrets.mjs",
);
const SECRET = "synthetic-webhook-secret-planted";

let dir: string;
afterEach(() => rmSync(dir, { recursive: true, force: true }));

function build(files: Record<string, string>) {
  dir = mkdtempSync(join(tmpdir(), "client-secrets-"));
  for (const [path, body] of Object.entries({
    ".next/static/chunks/app.js": "console.log('ok')",
    ...files,
  })) {
    mkdirSync(join(dir, path, ".."), { recursive: true });
    writeFileSync(join(dir, path), body);
  }
}

function check(): { ok: boolean; output: string } {
  // Only the planted env: none of the real environment's secrets.
  const env = {
    PATH: process.env.PATH ?? "",
    NODE_ENV: "production",
  } as NodeJS.ProcessEnv;
  try {
    const output = execFileSync(process.execPath, [SCRIPT], {
      cwd: dir,
      env,
      encoding: "utf8",
      stdio: "pipe",
    });
    return { ok: true, output };
  } catch (error) {
    const failed = error as { stdout: string; stderr: string };
    return { ok: false, output: failed.stdout + failed.stderr };
  }
}

describe("check-client-secrets", () => {
  it("passes a clean build", () => {
    build({ ".next/server/app/index.html": "<p>shop</p>" });
    expect(check().ok).toBe(true);
  });

  it("reads secrets from .env.production and finds them in prerendered HTML", () => {
    build({
      ".env.production": `SHOPIFY_WEBHOOK_SECRET=${SECRET}\n`,
      ".next/server/app/index.html": `<script>${SECRET}</script>`,
    });
    const { ok, output } = check();
    expect(ok).toBe(false);
    expect(output).toContain("SHOPIFY_WEBHOOK_SECRET value found");
    expect(output).not.toContain(SECRET);
  });

  it("finds server-only auth header names in prerendered pages", () => {
    build({
      ".next/server/app/cart.rsc": '{"h":"Shopify-Storefront-Private-Token"}',
    });
    const { ok, output } = check();
    expect(ok).toBe(false);
    expect(output).toContain("Shopify-Storefront-Private-Token");
  });
});
