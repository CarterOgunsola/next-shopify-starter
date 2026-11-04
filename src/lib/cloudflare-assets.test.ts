import { PHASE_PRODUCTION_BUILD } from "next/constants";
import { afterEach, describe, expect, it, vi } from "vitest";
import config from "../../next.config";
import { assetHeaders } from "../../scripts/cloudflare-assets.mjs";

afterEach(() => vi.unstubAllEnvs());

// The _headers file for a production build's headers() rules, which the
// routes manifest holds.
async function headersFile(siteIndexed: string) {
  vi.stubEnv("SITE_INDEXED", siteIndexed);
  return assetHeaders(await config(PHASE_PRODUCTION_BUILD).headers!());
}

describe("Cloudflare's _headers for static files", () => {
  it("says noindex on every static file until launch, as pages do", async () => {
    const file = await headersFile("");
    // In the block for every path.
    expect(file.slice(file.indexOf("\n/*\n"))).toContain(
      "  X-Robots-Tag: noindex, nofollow\n",
    );
  });

  it("drops the noindex after launch", async () => {
    expect(await headersFile("true")).not.toContain("X-Robots-Tag");
  });

  it("keeps the immutable cache and the security headers either way", async () => {
    for (const value of ["", "true"]) {
      const file = await headersFile(value);
      expect(file).toContain(
        "/_next/static/*\n  Cache-Control: public, max-age=31536000, immutable\n",
      );
      expect(file).toContain("  X-Content-Type-Options: nosniff\n");
      expect(file).toContain(
        "  Strict-Transport-Security: max-age=63072000; includeSubDomains\n",
      );
    }
  });
});
