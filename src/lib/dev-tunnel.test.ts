import {
  PHASE_DEVELOPMENT_SERVER,
  PHASE_PRODUCTION_BUILD,
  PHASE_PRODUCTION_SERVER,
} from "next/constants";
import { describe, expect, it } from "vitest";
import config from "../../next.config";
import { isDevTunnelHost } from "./dev-tunnel";

describe("dev tunnel", () => {
  it("lets a quick tunnel use the dev server, and never a production build", () => {
    const dev = config(PHASE_DEVELOPMENT_SERVER);
    expect(dev.allowedDevOrigins).toEqual(["*.trycloudflare.com"]);
    expect(dev.experimental?.serverActions?.allowedOrigins).toEqual([
      "*.trycloudflare.com",
    ]);
    for (const phase of [PHASE_PRODUCTION_BUILD, PHASE_PRODUCTION_SERVER]) {
      const built = config(phase);
      expect(built.allowedDevOrigins).toBeUndefined();
      expect(built.experimental?.serverActions).toBeUndefined();
    }
  });

  it("knows a quick tunnel's host", () => {
    expect(isDevTunnelHost("brave-otter-test.trycloudflare.com")).toBe(true);
    expect(isDevTunnelHost("trycloudflare.com")).toBe(false);
    expect(isDevTunnelHost("a.b.trycloudflare.com")).toBe(false);
    expect(isDevTunnelHost("x.trycloudflare.com.evil.example")).toBe(false);
    expect(isDevTunnelHost("x.trycloudflare.com:4747")).toBe(false);
  });
});
