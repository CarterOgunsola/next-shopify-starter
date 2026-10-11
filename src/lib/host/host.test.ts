import { describe, expect, it } from "vitest";
import { currentHost } from "./host";

describe("currentHost", () => {
  it("defaults to Vercel", () => {
    expect(currentHost({})).toBe("vercel");
    expect(currentHost({ HOSTING: "" })).toBe("vercel");
    expect(currentHost({ HOSTING: "  " })).toBe("vercel");
  });

  it("reads HOSTING", () => {
    expect(currentHost({ HOSTING: "vercel" })).toBe("vercel");
    expect(currentHost({ HOSTING: "cloudflare" })).toBe("cloudflare");
    expect(currentHost({ HOSTING: " Cloudflare\n" })).toBe("cloudflare");
  });

  it("refuses an unknown host rather than trusting the wrong headers", () => {
    expect(() => currentHost({ HOSTING: "netlify" })).toThrow(
      "HOSTING should be one of: vercel, cloudflare.",
    );
  });
});
