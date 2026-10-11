import { createRateLimiter } from "@/lib/rate-limit";
import { describe, expect, it, vi } from "vitest";
import { handleCspReport, MAX_BODY, summarize } from "./csp-report";

describe("summarize", () => {
  it("reads report-uri reports and keeps only the origin", () => {
    expect(
      summarize({
        "csp-report": {
          "effective-directive": "script-src-elem",
          "blocked-uri": "https://evil.example/x.js?email=someone@example.com",
        },
      }),
    ).toEqual([
      { directive: "script-src-elem", blocked: "https://evil.example" },
    ]);
  });

  it("reads Reporting API batches", () => {
    expect(
      summarize([
        {
          type: "csp-violation",
          body: { effectiveDirective: "connect-src", blockedURL: "inline" },
        },
      ]),
    ).toEqual([{ directive: "connect-src", blocked: "inline" }]);
  });

  it("ignores junk", () => {
    expect(summarize(null)).toEqual([]);
    expect(summarize([1, "x"])).toEqual([]);
  });
});

const report = (directive: string) => ({
  "csp-report": {
    "effective-directive": directive,
    "blocked-uri": "https://cdn.example/x.js",
  },
});

const post = (body: string, headers: Record<string, string> = {}) =>
  new Request("https://local.test/api/csp-report", {
    method: "POST",
    body,
    headers: { "x-real-ip": "203.0.113.7", ...headers },
  });

describe("handleCspReport", () => {
  it("rejects a declared oversize body without reading it", async () => {
    const log = vi.fn();
    const response = await handleCspReport(
      post("{}", { "content-length": String(MAX_BODY + 1) }),
      { log, allow: () => true },
    );
    expect(response.status).toBe(413);
    expect(log).not.toHaveBeenCalled();
  });

  it("rejects a body that runs past the cap", async () => {
    const response = await handleCspReport(post("x".repeat(MAX_BODY + 1)), {
      allow: () => true,
    });
    expect(response.status).toBe(413);
  });

  it("logs at most five reports, with clean directives", async () => {
    const log = vi.fn();
    const many = Array.from({ length: 8 }, () =>
      report("script-src\n[csp] forged 1"),
    );
    await handleCspReport(post(JSON.stringify(many)), {
      log,
      allow: () => true,
    });
    expect(log).toHaveBeenCalledTimes(5);
    expect(log).toHaveBeenCalledWith(
      "script-srccspforged",
      "https://cdn.example",
    );
  });

  it("rate-limits per client IP, without logging the refused reports", async () => {
    const allow = createRateLimiter({ limit: 2, windowMs: 60_000 });
    const log = vi.fn();
    const send = (ip: string) =>
      handleCspReport(
        post(JSON.stringify(report("img-src")), { "x-real-ip": ip }),
        { allow, log },
      ).then((response) => response.status);
    expect([await send("203.0.113.7"), await send("203.0.113.7")]).toEqual([
      204, 204,
    ]);
    expect(await send("203.0.113.7")).toBe(429);
    // Another client has its own allowance.
    expect(await send("198.51.100.4")).toBe(204);
    expect(log).toHaveBeenCalledTimes(3);
  });
});
