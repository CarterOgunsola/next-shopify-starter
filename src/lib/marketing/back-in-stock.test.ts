import { describe, expect, it, vi } from "vitest";
import { handleBackInStock } from "./back-in-stock";
import { klaviyoBackInStock } from "./klaviyo";

vi.mock("@/lib/env", () => ({ serverEnv: () => ({}) }));

const form = (fields: Record<string, string>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
};
const good = {
  email: "avery@example.test",
  variantId: "gid://shopify/ProductVariant/48430964211918",
};
const deps = (over = {}) => ({
  apiKey: "pk_synthetic",
  listId: "SynList",
  allow: () => true,
  clientKey: "203.0.113.7",
  alert: vi.fn(async () => ({ ok: true as const })),
  subscribe: vi.fn(async () => ({ ok: true as const })),
  log: vi.fn(),
  ...over,
});

describe("handleBackInStock", () => {
  it("asks Klaviyo for one alert for the variant, and no marketing", async () => {
    const d = deps();
    expect(await handleBackInStock(form(good), d)).toEqual({
      status: "success",
      message: "We'll email you when it's back in stock.",
    });
    expect(d.alert).toHaveBeenCalledWith({
      apiKey: "pk_synthetic",
      email: "avery@example.test",
      variantId: "48430964211918",
    });
    expect(d.subscribe).not.toHaveBeenCalled();
  });

  it("subscribes to marketing only when that box is ticked", async () => {
    const d = deps();
    await handleBackInStock(form({ ...good, marketing: "on" }), d);
    expect(d.subscribe).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "avery@example.test",
        listId: "SynList",
      }),
    );
  });

  it.each([
    [{ ...good, email: "nope" }, "Enter a valid email address.", "email"],
    [
      { ...good, variantId: "gid://shopify/Product/1" },
      "Choose an option first.",
      undefined,
    ],
  ])("refuses bad input: %j", async (fields, message, field) => {
    const d = deps();
    const result = await handleBackInStock(form(fields), d);
    expect(result).toMatchObject({
      status: "error",
      message,
      email: fields.email,
    });
    // Only an error about the address points at the field.
    expect((result as { field?: string }).field).toBe(field);
    expect(d.alert).not.toHaveBeenCalled();
  });

  it("does nothing for a bot, and limits each visitor", async () => {
    const bot = deps();
    expect(
      await handleBackInStock(form({ ...good, website: "x" }), bot),
    ).toMatchObject({ status: "success" });
    expect(bot.alert).not.toHaveBeenCalled();
    const busy = deps({ allow: () => false });
    expect(await handleBackInStock(form(good), busy)).toMatchObject({
      status: "error",
      message: "Too many attempts. Try again in a few minutes.",
    });
  });

  it("says alerts aren't set up without a key, and logs no email address", async () => {
    const d = deps({ apiKey: undefined });
    expect(await handleBackInStock(form(good), d)).toMatchObject({
      status: "error",
      message: "Alerts aren't available yet. Check back soon.",
    });
    const failing = deps({
      alert: vi.fn(async () => ({ ok: false as const, status: 400 })),
    });
    expect(
      await handleBackInStock(form({ ...good, marketing: "on" }), failing),
    ).toMatchObject({
      status: "error",
    });
    expect(failing.subscribe).not.toHaveBeenCalled();
    for (const log of [d.log, failing.log]) {
      expect(JSON.stringify(log.mock.calls)).not.toContain("@example.test");
    }
  });
});

describe("klaviyoBackInStock", () => {
  it("posts Klaviyo's back-in-stock subscription for the Shopify variant", async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 202 }));
    expect(
      await klaviyoBackInStock({
        apiKey: "pk_synthetic",
        email: "avery@example.test",
        variantId: "48430964211918",
        fetchImpl,
      }),
    ).toEqual({ ok: true });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe("https://a.klaviyo.com/api/back-in-stock-subscriptions");
    expect((init.headers as Record<string, string>).authorization).toBe(
      "Klaviyo-API-Key pk_synthetic",
    );
    expect(JSON.parse(String(init.body))).toEqual({
      data: {
        type: "back-in-stock-subscription",
        attributes: {
          channels: ["EMAIL"],
          profile: {
            data: {
              type: "profile",
              attributes: { email: "avery@example.test" },
            },
          },
        },
        relationships: {
          variant: {
            data: {
              type: "catalog-variant",
              id: "$shopify:::$default:::48430964211918",
            },
          },
        },
      },
    });
  });
});
