import { afterEach, describe, expect, it, vi } from "vitest";

const incoming = vi.hoisted(() => ({ headers: new Headers() }));
vi.mock("next/headers", () => ({ headers: async () => incoming.headers }));

const { getBuyerIp, MissingBuyerIpError } = await import("./buyer.server");

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("getBuyerIp", () => {
  it("reads the host's client IP header", async () => {
    incoming.headers = new Headers({ "x-real-ip": "203.0.113.7" });
    expect(await getBuyerIp()).toBe("203.0.113.7");
  });

  it("refuses a buyer call without one in production, warning once", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    incoming.headers = new Headers({ "x-forwarded-for": "198.51.100.1" });
    await expect(getBuyerIp()).rejects.toBeInstanceOf(MissingBuyerIpError);
    await expect(getBuyerIp()).rejects.toBeInstanceOf(MissingBuyerIpError);
    expect(warn).toHaveBeenCalledTimes(1);
  });
});
