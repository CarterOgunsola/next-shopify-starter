import { HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { addToCart } from "./cart.server";
import mixed from "./testing/fixtures/CartCreate.one-time-and-subscription.json";
import { server, shopify } from "./testing/msw";

// Adding to the cart with customer accounts configured and the real
// customerAccess(): Shopify's shop id lookup failing must not stop a guest
// (or a customer whose session can't be read) from adding.
const jar = vi.hoisted(() => new Map<string, string>());
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      jar.has(name) ? { name, value: jar.get(name)! } : undefined,
    has: (name: string) => jar.has(name),
    set: (name: string, value: string) => jar.set(name, value),
    delete: (name: string) => jar.delete(name),
  }),
  headers: async () =>
    new Headers({ "x-real-ip": "203.0.113.7", host: "local.test" }),
}));

const buyer = { audience: "consumer" } as const;
const VARIANT = "gid://shopify/ProductVariant/48430713307342";
let shopIdAsked = 0;

beforeEach(() => {
  jar.clear();
  shopIdAsked = 0;
  vi.stubEnv("SHOPIFY_CUSTOMER_CLIENT_ID", "synthetic-client-id");
  vi.stubEnv(
    "CUSTOMER_ACCOUNT_SESSION_SECRET",
    "synthetic-session-secret-0123456789abcdef",
  );
  vi.spyOn(console, "warn").mockImplementation(() => {});
  server.use(
    shopify.query("ShopId", () => {
      shopIdAsked++;
      return HttpResponse.error();
    }),
    shopify.mutation("CartCreate", () =>
      HttpResponse.json({ data: { cartCreate: mixed.data.cartCreate } }),
    ),
  );
});

describe("adding to the cart while the shop id lookup fails", () => {
  it("works for a guest, who never waits on the lookup", async () => {
    const result = await addToCart(
      [{ merchandiseId: VARIANT, quantity: 1 }],
      buyer,
    );
    expect(result.ok).toBe(true);
    expect(shopIdAsked).toBe(0);
  });

  it("works for a visitor whose session can't be read, as a guest", async () => {
    jar.set("store_customer", "sealed-session");
    const result = await addToCart(
      [{ merchandiseId: VARIANT, quantity: 1 }],
      buyer,
    );
    expect(result.ok).toBe(true);
  });
});
