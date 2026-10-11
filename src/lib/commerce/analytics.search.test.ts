// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";

const track = vi.hoisted(() => vi.fn());
vi.mock("@/lib/analytics/track", () => ({ track }));

const { searched } = await import("./analytics.client");

describe("searched", () => {
  it("sends the result count to GA only: no term, and nothing to Shopify", () => {
    const publish = vi.fn();
    (window as unknown as { Shopify: unknown }).Shopify = {
      analytics: { publish },
    };
    searched(7);
    expect(track).toHaveBeenCalledWith("search", { result_count: 7 });
    // Shopify's script would report it with the page URL, ?q= included.
    expect(publish).not.toHaveBeenCalled();
  });
});
