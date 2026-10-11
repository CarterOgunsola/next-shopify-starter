import { describe, expect, it, vi } from "vitest";
import {
  CUSTOMER_COOKIE,
  openSession,
  readCookie,
  readSessionValue,
  sealSession,
  sessionSetCookies,
} from "./session-cookie";

const SECRET = "synthetic-session-secret-0123456789abcdef";

describe("customer session cookie", () => {
  it("round-trips the session", () => {
    const data = { state: "abc", tokens: { access: "synthetic" } };
    expect(openSession(sealSession(data, SECRET), SECRET)).toEqual(data);
  });

  it("reads a tampered cookie or a different secret as signed out", () => {
    const sealed = sealSession({ a: 1 }, SECRET);
    const tampered = sealed.slice(0, -2) + (sealed.endsWith("A") ? "BB" : "AA");
    expect(openSession(tampered, SECRET)).toEqual({});
    expect(openSession(sealed, `${SECRET}-other`)).toEqual({});
    expect(openSession("not-base64!", SECRET)).toEqual({});
    expect(openSession(undefined, SECRET)).toEqual({});
  });

  it("never stores the session readably", () => {
    const sealed = sealSession({ token: "synthetic-access-token" }, SECRET);
    expect(Buffer.from(sealed, "base64url").toString("utf8")).not.toContain(
      "synthetic-access-token",
    );
  });

  it("writes a locked-down cookie, and clears every chunk when empty", () => {
    const [first, ...rest] = sessionSetCookies({ a: 1 }, SECRET);
    expect(first).toMatch(
      new RegExp(
        `^${CUSTOMER_COOKIE}=[\\w-]+; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000$`,
      ),
    );
    // Unused chunks are cleared, so a shrinking session leaves nothing behind.
    expect(rest).toEqual(
      [1, 2, 3].map(
        (i) =>
          `${CUSTOMER_COOKIE}.${i}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`,
      ),
    );
    expect(
      sessionSetCookies({}, SECRET).every((c) => c.endsWith("Max-Age=0")),
    ).toBe(true);
  });

  it("splits a large session across chunks and reads it back", () => {
    const data = { tokens: "x".repeat(6000) };
    const set = sessionSetCookies(data, SECRET);
    const jar = new Map(
      set.map((cookie) => {
        const [pair] = cookie.split("; ");
        const [name, value] = pair.split("=");
        return [name, value];
      }),
    );
    expect(jar.get(`${CUSTOMER_COOKIE}.1`)).not.toBe("");
    for (const value of jar.values())
      expect(value.length).toBeLessThanOrEqual(3800);
    const sealed = readSessionValue((name) => jar.get(name) || undefined);
    expect(openSession(sealed, SECRET)).toEqual(data);
  });

  it("drops a session too big for every chunk instead of failing", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const set = sessionSetCookies({ big: "x".repeat(20000) }, SECRET);
    expect(set.every((cookie) => cookie.endsWith("Max-Age=0"))).toBe(true);
  });

  it("reads one cookie from a header", () => {
    expect(readCookie("a=1; store_customer=xyz=; b=2", "store_customer")).toBe(
      "xyz=",
    );
    expect(readCookie(null, "store_customer")).toBeUndefined();
  });
});
