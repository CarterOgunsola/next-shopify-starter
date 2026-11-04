import { describe, expect, it, vi } from "vitest";

const linked = vi.hoisted(() => ({ calls: 0, steps: [] as string[] }));
vi.mock("@/lib/commerce/customer.server", () => ({
  linkCart: async () => {
    linked.calls++;
    linked.steps.push("linkCart");
  },
}));
vi.mock("next/server", () => ({
  connection: async () => {
    linked.steps.push("connection");
  },
}));
vi.mock("@/lib/flags", () => ({ isShopEnabled: () => true }));

const { GET } = await import("./route");
const at = (returnTo: string) =>
  GET(
    new Request(
      `https://local.test/account/link-cart?return_to=${encodeURIComponent(returnTo)}`,
    ),
  );

describe("/account/link-cart", () => {
  it("links the cart, then continues to a path on this site", async () => {
    const response = await at("/cart/checkout?refreshed=1");
    expect(linked.calls).toBe(1);
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/cart/checkout?refreshed=1");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it("waits for a request before linking, so a build never starts the Shopify call", async () => {
    linked.steps.length = 0;
    await at("/");
    expect(linked.steps).toEqual(["connection", "linkCart"]);
  });

  it.each([
    "//evil.example/x",
    "https://evil.example/x",
    "/\\evil.example",
    "/.//evil.example",
    "javascript:alert(1)",
  ])("goes home instead of off the site: %s", async (target) => {
    const response = await at(target);
    expect(response.headers.get("location")).toBe("/");
  });
});
