import { describe, expect, it } from "vitest";
import { clientIp } from "./client-ip";

const prod = { dev: false, host: "vercel" as const };

describe("clientIp", () => {
  it("uses headers the host sets, in order", () => {
    expect(
      clientIp(
        new Headers({
          "x-vercel-forwarded-for": "203.0.113.7",
          "x-real-ip": "198.51.100.2",
        }),
        prod,
      ),
    ).toBe("203.0.113.7");
    expect(clientIp(new Headers({ "x-real-ip": "2001:db8::1" }), prod)).toBe(
      "2001:db8::1",
    );
  });

  it("ignores a forged leading x-forwarded-for entry", () => {
    const forged = new Headers({
      "x-forwarded-for": "192.0.2.66, 203.0.113.7",
      "x-vercel-forwarded-for": "203.0.113.7",
    });
    expect(clientIp(forged, prod)).toBe("203.0.113.7");
    expect(clientIp(forged, { dev: true })).toBe("203.0.113.7");
  });

  it("never reads x-forwarded-for in production", () => {
    expect(
      clientIp(
        new Headers({ "x-forwarded-for": "192.0.2.66, 203.0.113.7" }),
        prod,
      ),
    ).toBeUndefined();
  });

  it("uses the last x-forwarded-for hop in dev", () => {
    expect(
      clientIp(new Headers({ "x-forwarded-for": "192.0.2.66, ::1" }), {
        dev: true,
      }),
    ).toBe("::1");
  });

  it("trusts only the host's own headers", () => {
    const headers = new Headers({
      "cf-connecting-ip": "203.0.113.9",
      "x-vercel-forwarded-for": "198.51.100.2",
      "x-real-ip": "198.51.100.3",
    });
    expect(clientIp(headers, { ...prod, host: "vercel" })).toBe("198.51.100.2");
    expect(clientIp(headers, { ...prod, host: "cloudflare" })).toBe(
      "203.0.113.9",
    );
    // A client can send the other platform's headers itself.
    expect(
      clientIp(new Headers({ "cf-connecting-ip": "203.0.113.9" }), {
        ...prod,
        host: "vercel",
      }),
    ).toBeUndefined();
    expect(
      clientIp(
        new Headers({
          "x-vercel-forwarded-for": "198.51.100.2",
          "x-real-ip": "198.51.100.3",
        }),
        { ...prod, host: "cloudflare" },
      ),
    ).toBeUndefined();
  });

  it("follows HOSTING when no host is passed", () => {
    const headers = new Headers({
      "cf-connecting-ip": "203.0.113.9",
      "x-real-ip": "198.51.100.3",
    });
    const before = process.env.HOSTING;
    try {
      delete process.env.HOSTING;
      expect(clientIp(headers, { dev: false })).toBe("198.51.100.3");
      process.env.HOSTING = "cloudflare";
      expect(clientIp(headers, { dev: false })).toBe("203.0.113.9");
    } finally {
      if (before === undefined) delete process.env.HOSTING;
      else process.env.HOSTING = before;
    }
  });

  it("falls back to the last x-forwarded-for hop on Cloudflare in dev only", () => {
    const headers = new Headers({ "x-forwarded-for": "192.0.2.66, ::1" });
    expect(clientIp(headers, { host: "cloudflare", dev: true })).toBe("::1");
    expect(
      clientIp(headers, { host: "cloudflare", dev: false }),
    ).toBeUndefined();
  });

  it("takes an explicit list, e.g. Cloudflare's proxy in front of Vercel", () => {
    const headers = new Headers({
      "cf-connecting-ip": "203.0.113.9",
      "x-vercel-forwarded-for": "198.51.100.2",
    });
    expect(
      clientIp(headers, {
        ...prod,
        trusted: ["cf-connecting-ip", "x-vercel-forwarded-for"],
      }),
    ).toBe("203.0.113.9");
  });

  it("rejects values that aren't IPs", () => {
    expect(
      clientIp(new Headers({ "x-real-ip": "not-an-ip" }), prod),
    ).toBeUndefined();
  });
});
