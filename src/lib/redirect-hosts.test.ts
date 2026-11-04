import { PHASE_PRODUCTION_BUILD } from "next/constants";
import { afterEach, describe, expect, it, vi } from "vitest";
import config from "../../next.config";
import { hostRedirects } from "./redirect-hosts";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

const SITE = "https://shop.example";
const redirects = (REDIRECT_HOSTS?: string) =>
  hostRedirects({ NEXT_PUBLIC_SITE_URL: SITE, REDIRECT_HOSTS });

describe("REDIRECT_HOSTS", () => {
  it("redirects nothing when it's unset or empty", () => {
    expect(redirects(undefined)).toEqual([]);
    expect(redirects(" , ")).toEqual([]);
  });

  it("sends each listed host to the same path on the site, permanently", () => {
    expect(redirects(" Old-Site.vercel.app , www.shop.example")).toEqual([
      {
        source: "/:path*",
        has: [{ type: "host", value: "old-site\\.vercel\\.app" }],
        destination: "https://shop.example/:path*",
        permanent: true,
      },
      {
        source: "/:path*",
        has: [{ type: "host", value: "www\\.shop\\.example" }],
        destination: "https://shop.example/:path*",
        permanent: true,
      },
    ]);
  });

  it("escapes dots, so a look-alike host or a preview URL isn't matched", () => {
    const [vercel, workers] = redirects("old.vercel.app,old.team.workers.dev");
    // As Next matches a host value.
    const matches = (rule: (typeof vercel)["has"][0], host: string) =>
      new RegExp(`^${rule.value}$`).test(host);
    expect(matches(vercel.has[0], "old.vercel.app")).toBe(true);
    expect(matches(vercel.has[0], "oldxvercelxapp")).toBe(false);
    expect(matches(vercel.has[0], "old-git-main-team.vercel.app")).toBe(false);
    expect(matches(workers.has[0], "old.team.workers.dev")).toBe(true);
    expect(matches(workers.has[0], "1a2b3c4d-old.team.workers.dev")).toBe(
      false,
    );
  });

  it("skips the site's own host with a warning, so nothing loops", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(redirects("shop.example")).toEqual([]);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("shop.example"));
  });

  it("ignores malformed entries with a warning", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const malformed = [
      "*.vercel.app",
      "https://old.example",
      "old.example/path",
      "old.example:443",
      "old..example",
      "-old.example",
      "old example",
    ];
    expect(redirects([...malformed, "kept.example"].join(","))).toHaveLength(1);
    expect(warn).toHaveBeenCalledTimes(malformed.length);
  });

  it("is what a production build redirects", async () => {
    const built = async () =>
      (await config(PHASE_PRODUCTION_BUILD).redirects?.()) ?? [];
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", SITE);
    vi.stubEnv("REDIRECT_HOSTS", "old.vercel.app");
    expect(await built()).toEqual(redirects("old.vercel.app"));
    vi.stubEnv("REDIRECT_HOSTS", "");
    expect(await built()).toEqual([]);
  });
});
