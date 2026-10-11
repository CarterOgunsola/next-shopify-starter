import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { server } from "@/lib/commerce/testing/msw";
import page1 from "./fixtures/judgeme.reviews.page-1.json";
import { displayName, judgeme } from "./judgeme.server";

// Synthetic Judge.me responses in its API's shape.
const TOKEN = "synthetic-judgeme-token";
const provider = judgeme({
  token: TOKEN,
  shopDomain: "synthetic-store.myshopify.com",
});

function judgemeApi({ productFound = true } = {}) {
  const asked: URL[] = [];
  server.use(
    http.get("https://judge.me/api/v1/products/-1", ({ request }) => {
      asked.push(new URL(request.url));
      return productFound
        ? HttpResponse.json({
            product: { id: 777, handle: "test-electrolytes" },
          })
        : HttpResponse.json({ product: null });
    }),
    http.get("https://judge.me/api/v1/reviews", ({ request }) => {
      asked.push(new URL(request.url));
      return HttpResponse.json(page1);
    }),
  );
  return asked;
}

describe("Judge.me reviews", () => {
  it("lists published reviews with no reviewer email, IP or full surname", async () => {
    const asked = judgemeApi();
    const result = await provider.list("5550001", 1);
    expect(result).toEqual({
      page: 1,
      // A full page came back: there may be more.
      hasMore: true,
      reviews: [
        {
          id: "9001",
          rating: 5,
          title: "Easy to drink",
          body: "Mixes well and the lemon is not too sweet.",
          author: "Avery E.",
          createdAt: "2026-09-30T14:00:00.000Z",
          verifiedBuyer: true,
          incentivized: true,
        },
        {
          id: "9002",
          rating: 4,
          title: null,
          body: "Good for long runs.\nWill buy again.",
          author: "sam",
          createdAt: "2026-09-28T09:00:00.000Z",
          verifiedBuyer: false,
          incentivized: false,
        },
        // Only approved reviews: not hidden (9003), unpublished (9004) or
        // curated as spam (9005).
      ],
    });
    expect(JSON.stringify(result)).not.toMatch(
      /@example\.test|198\.51|Example|Hidden|Pending|Jordan/,
    );
    const [lookup, list] = asked;
    expect(lookup.searchParams.get("external_id")).toBe("5550001");
    expect(lookup.searchParams.get("api_token")).toBe(TOKEN);
    expect(list.searchParams.get("product_id")).toBe("777");
    expect(list.searchParams.get("per_page")).toBe("5");
  });

  it("has no reviews for a product Judge.me doesn't know", async () => {
    judgemeApi({ productFound: false });
    expect(await provider.list("5550099", 1)).toEqual({
      reviews: [],
      page: 1,
      hasMore: false,
    });
  });

  it("sends a new review with the private token, server side", async () => {
    let sent: { url: URL; body: unknown } | undefined;
    server.use(
      http.post("https://judge.me/api/v1/reviews", async ({ request }) => {
        sent = { url: new URL(request.url), body: await request.json() };
        return HttpResponse.json({ message: "ok" }, { status: 201 });
      }),
    );
    const input = {
      productId: "5550001",
      name: "Avery Example",
      email: "avery@example.test",
      rating: 5,
      title: "Great",
      body: "Mixes well and tastes good.",
    };
    expect(await provider.submit(input)).toEqual({ ok: true });
    expect(sent?.url.searchParams.get("api_token")).toBe(TOKEN);
    expect(sent?.body).toEqual({
      shop_domain: "synthetic-store.myshopify.com",
      platform: "shopify",
      id: "5550001",
      ...Object.fromEntries(
        Object.entries(input).filter(([k]) => k !== "productId"),
      ),
    });

    server.use(
      http.post(
        "https://judge.me/api/v1/reviews",
        () => new HttpResponse(null, { status: 422 }),
      ),
    );
    expect(await provider.submit(input)).toEqual({
      ok: false,
      reason: "failed",
    });
  });
});

describe("displayName", () => {
  it.each([
    ["Avery Example", "Avery E."],
    ["  avery   de la cruz ", "avery C."],
    ["Mononym", "Mononym"],
    ["", "Anonymous"],
    [null, "Anonymous"],
    // Never an email address.
    ["avery@example.test", "Anonymous"],
  ])("shows %j as %j", (name, shown) => {
    expect(displayName(name)).toBe(shown);
  });
});
