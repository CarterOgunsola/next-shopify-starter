import { describe, expect, it } from "vitest";
import { requestCountry } from "./request-geo";

describe("requestCountry", () => {
  it("reads Vercel's geo header on Vercel", () => {
    const headers = new Headers({ "x-vercel-ip-country": "US" });
    expect(requestCountry(headers, "vercel")).toBe("US");
  });

  it("reads Cloudflare's geo header on Cloudflare", () => {
    const headers = new Headers({ "cf-ipcountry": "DE" });
    expect(requestCountry(headers, "cloudflare")).toBe("DE");
  });

  it("ignores the other platform's header, which a client can send", () => {
    expect(
      requestCountry(new Headers({ "cf-ipcountry": "US" }), "vercel"),
    ).toBeUndefined();
    expect(
      requestCountry(
        new Headers({ "x-vercel-ip-country": "US" }),
        "cloudflare",
      ),
    ).toBeUndefined();
  });

  it("follows HOSTING when no host is passed", () => {
    const headers = new Headers({
      "x-vercel-ip-country": "US",
      "cf-ipcountry": "FR",
    });
    const before = process.env.HOSTING;
    try {
      delete process.env.HOSTING;
      expect(requestCountry(headers)).toBe("US");
      process.env.HOSTING = "cloudflare";
      expect(requestCountry(headers)).toBe("FR");
    } finally {
      if (before === undefined) delete process.env.HOSTING;
      else process.env.HOSTING = before;
    }
  });

  it("treats a missing, malformed or non-country value as unknown", () => {
    const country = (value: string) =>
      requestCountry(new Headers({ "cf-ipcountry": value }), "cloudflare");
    expect(requestCountry(new Headers(), "cloudflare")).toBeUndefined();
    expect(requestCountry(new Headers(), "vercel")).toBeUndefined();
    expect(country("XX")).toBeUndefined();
    expect(country("T1")).toBeUndefined();
    expect(country("USA")).toBeUndefined();
    expect(country("U;S")).toBeUndefined();
    expect(country("gb")).toBe("GB");
  });
});
