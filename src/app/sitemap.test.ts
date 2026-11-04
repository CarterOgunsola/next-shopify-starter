import { afterEach, describe, expect, it, vi } from "vitest";

const flags = vi.hoisted(() => ({ site: false }));
vi.mock("@/lib/flags", () => ({ isSiteIndexed: () => flags.site }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
}));

const { default: sitemap } = await import("./sitemap");

afterEach(() => {
  flags.site = false;
});

describe("sitemap.xml", () => {
  it("404s until launch", async () => {
    await expect(sitemap()).rejects.toThrow("NOT_FOUND");
  });

  it("lists the home page and the legal pages after launch", async () => {
    flags.site = true;
    const paths = (await sitemap()).map((entry) => new URL(entry.url).pathname);
    expect(paths).toEqual(
      expect.arrayContaining([
        "/",
        "/privacy",
        "/terms",
        "/cookies",
        "/privacy-choices",
      ]),
    );
  });
});
