import { describe, expect, it } from "vitest";
import { createRateLimiter } from "./rate-limit";

describe("createRateLimiter", () => {
  it("allows up to the limit per window, per key", () => {
    let time = 0;
    const allow = createRateLimiter({
      limit: 2,
      windowMs: 1000,
      now: () => time,
    });
    expect(allow("a")).toBe(true);
    expect(allow("a")).toBe(true);
    expect(allow("a")).toBe(false);
    expect(allow("b")).toBe(true);
    time = 1000;
    expect(allow("a")).toBe(true);
  });
});
