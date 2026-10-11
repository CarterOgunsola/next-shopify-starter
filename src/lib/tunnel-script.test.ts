import { afterEach, describe, expect, it, vi } from "vitest";
import { check, registration, tunnelOrigin } from "../../scripts/tunnel.mjs";

describe("pnpm tunnel", () => {
  it("gives the values to register for a quick tunnel's URL", () => {
    const origin = tunnelOrigin("https://brave-otter-test.trycloudflare.com/");
    expect(origin).toBe("https://brave-otter-test.trycloudflare.com");
    expect(registration(origin)).toEqual({
      callback: "https://brave-otter-test.trycloudflare.com/account/authorize",
      javascriptOrigin: "https://brave-otter-test.trycloudflare.com",
      logout: "https://brave-otter-test.trycloudflare.com/",
    });
  });

  it("takes only a quick tunnel's HTTPS URL", () => {
    for (const input of [
      "http://brave-otter-test.trycloudflare.com",
      "https://trycloudflare.com",
      "https://x.trycloudflare.com.evil.example",
      "https://x.trycloudflare.com:8443",
      "brave-otter-test.trycloudflare.com",
    ]) {
      expect(tunnelOrigin(input)).toBeNull();
    }
  });

  it("checks that sign-in starts with the tunnel's callback", async () => {
    const origin = "https://brave-otter-test.trycloudflare.com";
    const answer = (status: number, location?: string) =>
      vi.stubGlobal(
        "fetch",
        vi.fn(
          async () =>
            new Response(null, {
              status,
              headers: location ? { location } : {},
            }),
        ),
      );
    const authorize = (redirect: string) =>
      `https://shopify.com/authentication/1/oauth/authorize?client_id=synthetic&redirect_uri=${encodeURIComponent(redirect)}`;
    answer(302, authorize(`${origin}/account/authorize`));
    expect(await check(origin)).toMatch(/^OK/);
    answer(302, authorize("http://localhost:4747/account/authorize"));
    expect(await check(origin)).toMatch(/isn't the tunnel's/);
    answer(303, `${origin}/account?login=https`);
    expect(await check(origin)).toMatch(/plain-HTTP origin/);
    answer(404);
    expect(await check(origin)).toMatch(/isn't set up/);
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});
