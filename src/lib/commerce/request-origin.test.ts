import { describe, expect, it } from "vitest";
import { requestOrigin } from "./request-origin";

describe("requestOrigin", () => {
  it("prefers the forwarded host and protocol", () => {
    const request = new Request("http://localhost:3460/account/login", {
      headers: {
        "x-forwarded-host": "local.tryhydrogen.dev:3463",
        "x-forwarded-proto": "https",
      },
    });
    expect(requestOrigin(request)).toBe("https://local.tryhydrogen.dev:3463");
  });

  it("falls back to the request URL", () => {
    expect(requestOrigin(new Request("https://shop.example.com/account"))).toBe(
      "https://shop.example.com",
    );
  });

  it("treats a quick tunnel as HTTPS in development only", () => {
    const request = new Request("http://localhost:4747/account/login", {
      headers: {
        "x-forwarded-host": "brave-otter-test.trycloudflare.com",
        "x-forwarded-proto": "http",
      },
    });
    expect(requestOrigin(request, true)).toBe(
      "https://brave-otter-test.trycloudflare.com",
    );
    // A production build has no tunnel: the platform's headers as sent.
    expect(requestOrigin(request, false)).toBe(
      "http://brave-otter-test.trycloudflare.com",
    );
    // Only a quick tunnel's own shape.
    const other = new Request("http://localhost:4747/", {
      headers: { "x-forwarded-host": "trycloudflare.com.evil.example" },
    });
    expect(requestOrigin(other, true)).toBe(
      "http://trycloudflare.com.evil.example",
    );
  });
});

describe("requestOrigin on Cloudflare", () => {
  it("uses the request URL and ignores forwarded headers", () => {
    const request = new Request("https://shop.example.com/account/login", {
      headers: {
        "x-forwarded-host": "other.example",
        "x-forwarded-proto": "http",
      },
    });
    expect(requestOrigin(request, false, "cloudflare")).toBe(
      "https://shop.example.com",
    );
    // Vercel still prefers its forwarded headers.
    expect(requestOrigin(request, false, "vercel")).toBe(
      "http://other.example",
    );
  });
});
