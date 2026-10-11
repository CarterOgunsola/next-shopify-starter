import { afterEach, describe, expect, it, vi } from "vitest";
import {
  recordTokenRequests,
  settleRefresh,
  tokenFetch,
} from "./customer-session.server";

const SECRET = "synthetic-secret-synthetic-secret-0123";
const refresh = () =>
  tokenFetch("https://shopify.com/authentication/1/oauth/token", {
    method: "POST",
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: "synthetic-refresh-token",
    }),
  });
const redirect = (setCookie?: string) =>
  new Response(null, {
    status: 302,
    headers: {
      Location: "/account/profile?refreshed=1",
      ...(setCookie ? { "Set-Cookie": setCookie } : {}),
    },
  });

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("token requests", () => {
  it("records and logs what Shopify said, without the token", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json(
          { error: "invalid_grant", error_description: "Token expired" },
          { status: 403 },
        ),
      ),
    );
    const { outcome } = await recordTokenRequests(refresh);
    expect(outcome).toEqual({ grant: "refresh_token", status: 403 });
    expect(warn).toHaveBeenCalledWith(
      '[accounts] token refresh_token answered 403: {"error":"invalid_grant","error_description":"Token expired"}',
    );
    expect(JSON.stringify(warn.mock.calls)).not.toContain("synthetic-refresh");
  });

  it("records a request that never got an answer", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("fetch failed");
      }),
    );
    const { outcome } = await recordTokenRequests(() =>
      refresh().catch(() => null),
    );
    expect(outcome).toEqual({ grant: "refresh_token", failure: "TypeError" });
  });
});

describe("settleRefresh", () => {
  it("clears a session Shopify answered without a usable token", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const settled = settleRefresh(redirect(), { status: 403 }, SECRET);
    const cookies = settled.headers.getSetCookie();
    expect(cookies).toHaveLength(4);
    expect(cookies.every((cookie) => cookie.includes("Max-Age=0"))).toBe(true);
    expect(cookies[0]).toMatch(/^store_customer=;/);
    expect(settled.headers.get("location")).toBe(
      "/account/profile?refreshed=1",
    );
  });

  it("keeps the session when the refresh failed for now", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    for (const outcome of [{ failure: "AbortError" }, { status: 503 }]) {
      expect(
        settleRefresh(redirect(), outcome, SECRET).headers.getSetCookie(),
      ).toEqual([]);
    }
  });

  it("leaves a refreshed or already-cleared session as Hydrogen wrote it", () => {
    const written = redirect("store_customer=sealed; Path=/; Max-Age=2592000");
    expect(settleRefresh(written, { status: 200 }, SECRET)).toBe(written);
  });
});
