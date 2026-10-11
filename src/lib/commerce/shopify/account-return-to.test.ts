import { HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { server, shopify } from "../testing/msw";
import { shopifyRouteResponse } from "./route-proxy.server";
import {
  CUSTOMER_COOKIE,
  openSession,
  readSessionValue,
} from "./session-cookie";

// Hydrogen's own sign-in routes (not mocked) keep return_to on this site.
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined }),
}));

const SECRET = "synthetic-session-secret-0123456789abcdef";
const OFF_SITE = [
  "//evil.example/x",
  "https://evil.example/x",
  "/\\evil.example",
  "/.//evil.example",
  "javascript:alert(1)",
];

beforeEach(() => {
  vi.stubEnv("SHOPIFY_CUSTOMER_CLIENT_ID", "synthetic-client-id");
  vi.stubEnv("CUSTOMER_ACCOUNT_SESSION_SECRET", SECRET);
  server.use(
    shopify.query("ShopId", () =>
      HttpResponse.json({ data: { shop: { id: "gid://shopify/Shop/7" } } }),
    ),
  );
});

const get = (path: string) =>
  shopifyRouteResponse(
    new Request(`https://local.test${path}`, {
      headers: { "x-real-ip": "203.0.113.7" },
    }),
  );

// The return path Hydrogen saved for after sign-in, from the session cookie
// it set.
function savedReturnTo(response: Response | null): unknown {
  const cookies = new Map(
    (response?.headers.getSetCookie() ?? []).map((c) => {
      const [pair] = c.split(";");
      const at = pair.indexOf("=");
      return [pair.slice(0, at), pair.slice(at + 1)] as const;
    }),
  );
  const sealed = readSessionValue((name) => cookies.get(name) || undefined);
  const session = sealed ? openSession(sealed, SECRET) : {};
  return JSON.stringify(session).match(/"returnTo":"([^"]*)"/)?.[1];
}

describe("return_to on Hydrogen's sign-in routes", () => {
  it("login keeps a path on this site", async () => {
    const response = await get(
      `/account/login?return_to=${encodeURIComponent("/account/orders?page=2")}`,
    );
    expect(response?.status).toBe(303);
    expect(new URL(response!.headers.get("location")!).host).toBe(
      "shopify.com",
    );
    expect(response?.headers.get("set-cookie")).toContain(CUSTOMER_COOKIE);
    expect(savedReturnTo(response)).toBe("/account/orders?page=2");
  });

  it.each(OFF_SITE)(
    "login never saves an off-site return_to: %s",
    async (target) => {
      const response = await get(
        `/account/login?return_to=${encodeURIComponent(target)}`,
      );
      const saved = savedReturnTo(response);
      expect(typeof saved).toBe("string");
      expect(new URL(String(saved), "https://local.test").origin).toBe(
        "https://local.test",
      );
      expect(String(saved)).not.toMatch(/evil|javascript/);
    },
  );

  it.each(OFF_SITE)(
    "refresh never redirects off the site: %s",
    async (target) => {
      const response = await get(
        `/account/refresh?return_to=${encodeURIComponent(target)}`,
      );
      const location = response?.headers.get("location") ?? "";
      expect(location).not.toBe("");
      expect(new URL(location, "https://local.test").origin).toBe(
        "https://local.test",
      );
      expect(location).not.toMatch(/evil|javascript/);
    },
  );

  it("refresh returns to a path on this site", async () => {
    const response = await get(
      `/account/refresh?return_to=${encodeURIComponent("/account/link-cart?return_to=%2Fcart")}`,
    );
    expect(
      new URL(response!.headers.get("location")!, "https://local.test")
        .pathname,
    ).toBe("/account/link-cart");
  });
});
