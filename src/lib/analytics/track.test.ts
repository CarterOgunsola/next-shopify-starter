import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defaultConsent } from "@/lib/consent/policy";
import type { ConsentState } from "@/lib/consent/types";
import {
  registerAdapter,
  resetAnalytics,
  setConsentReader,
  track,
  type AnalyticsAdapter,
  type TrackedEvent,
} from "./track";

function fakeAdapter(
  overrides: Partial<AnalyticsAdapter> = {},
): AnalyticsAdapter & { sent: TrackedEvent[] } {
  const sent: TrackedEvent[] = [];
  return {
    name: "fake",
    category: "analytics",
    send: (event) => sent.push(event),
    sent,
    ...overrides,
  };
}

const granted: ConsentState = defaultConsent({ model: "optOut", gpc: false });
const denied: ConsentState = defaultConsent({ model: "optIn", gpc: false });

describe("track", () => {
  beforeEach(() => resetAnalytics());
  afterEach(() => vi.restoreAllMocks());

  it("sends typed events to adapters whose category is granted", () => {
    setConsentReader(() => granted);
    const adapter = fakeAdapter();
    registerAdapter(adapter);

    track("page_view", { path: "/products/example" });

    expect(adapter.sent).toHaveLength(1);
    expect(adapter.sent[0]).toMatchObject({
      name: "page_view",
      payload: { path: "/products/example" },
    });
    expect(adapter.sent[0].eventId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("drops events when the category is denied", () => {
    setConsentReader(() => denied);
    const adapter = fakeAdapter();
    registerAdapter(adapter);

    track("video_play", {
      videoId: "abc",
      title: "Test video",
      provider: "youtube",
    });

    expect(adapter.sent).toHaveLength(0);
  });

  it("drops everything until consent is known", () => {
    const adapter = fakeAdapter();
    registerAdapter(adapter);
    track("page_view", { path: "/" });
    expect(adapter.sent).toHaveLength(0);
  });

  it("checks consent per adapter", () => {
    setConsentReader(() => ({ ...granted, marketing: false }));
    const analytics = fakeAdapter({ name: "a", category: "analytics" });
    const marketing = fakeAdapter({ name: "m", category: "marketing" });
    registerAdapter(analytics);
    registerAdapter(marketing);

    track("newsletter_signup", { source: "footer", channels: ["email"] });

    expect(analytics.sent).toHaveLength(1);
    expect(marketing.sent).toHaveLength(0);
  });

  it("honors a sale opt-out for adapters that respect it", () => {
    setConsentReader(() => ({ ...granted, saleOfData: false }));
    const adapter = fakeAdapter({
      category: "marketing",
      respectsSaleOptOut: true,
    });
    registerAdapter(adapter);
    track("page_view", { path: "/" });
    expect(adapter.sent).toHaveLength(0);
  });

  it("keeps going when one adapter throws", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    setConsentReader(() => granted);
    registerAdapter(
      fakeAdapter({
        name: "broken",
        send: () => {
          throw new Error("vendor down");
        },
      }),
    );
    const ok = fakeAdapter({ name: "ok" });
    registerAdapter(ok);

    track("page_view", { path: "/" });

    expect(ok.sent).toHaveLength(1);
  });

  it("stops sending after unregister", () => {
    setConsentReader(() => granted);
    const adapter = fakeAdapter();
    const unregister = registerAdapter(adapter);
    unregister();
    track("page_view", { path: "/" });
    expect(adapter.sent).toHaveLength(0);
  });

  it("only accepts known events with the right payload", () => {
    // @ts-expect-error unknown event name
    track("purchase", {});
    // @ts-expect-error wrong payload for page_view
    track("page_view", { videoId: "x" });
  });
});
