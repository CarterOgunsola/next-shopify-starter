import { describe, expect, it } from "vitest";
import { clientIp } from "./client-ip";

const prod = { dev: false };

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

  it("only trusts cf-connecting-ip when configured", () => {
    const headers = new Headers({
      "cf-connecting-ip": "203.0.113.9",
      "x-vercel-forwarded-for": "198.51.100.2",
    });
    expect(clientIp(headers, prod)).toBe("198.51.100.2");
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
