import { afterEach, describe, expect, it, vi } from "vitest";

const flags = vi.hoisted(() => ({ site: false, steps: [] as string[] }));
vi.mock("@/lib/flags", () => ({ isSiteIndexed: () => flags.site }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    flags.steps.push("notFound");
    throw new Error("NOT_FOUND");
  },
}));
vi.mock("next/server", () => ({
  connection: async () => {
    flags.steps.push("connection");
  },
}));

const { default: sitemap } = await import("./sitemap");

afterEach(() => {
  flags.site = false;
});

describe("sitemap.xml", () => {
  it("404s until launch, at request time rather than at build", async () => {
    flags.steps.length = 0;
    await expect(sitemap()).rejects.toThrow("NOT_FOUND");
    expect(flags.steps).toEqual(["connection", "notFound"]);
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
