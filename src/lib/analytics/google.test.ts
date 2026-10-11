import { describe, expect, it } from "vitest";
import { defaultConsent } from "@/lib/consent/policy";
import { gtmSnippet, toDataLayer, toGoogleConsent } from "./google";

describe("toGoogleConsent", () => {
  it("grants everything when everything is allowed", () => {
    expect(
      toGoogleConsent(defaultConsent({ model: "optOut", gpc: false })),
    ).toEqual({
      ad_storage: "granted",
      ad_user_data: "granted",
      ad_personalization: "granted",
      analytics_storage: "granted",
      functionality_storage: "granted",
      personalization_storage: "granted",
      security_storage: "granted",
    });
  });

  it("denies all but security under opt-in defaults", () => {
    const consent = toGoogleConsent(
      defaultConsent({ model: "optIn", gpc: false }),
    );
    expect(consent.security_storage).toBe("granted");
    expect(
      Object.entries(consent).filter(([, v]) => v === "granted"),
    ).toHaveLength(1);
  });

  it("denies ad signals on a sale opt-out even with marketing on", () => {
    const state = defaultConsent({ model: "optOut", gpc: false });
    const consent = toGoogleConsent({ ...state, saleOfData: false });
    expect(consent.ad_storage).toBe("denied");
    expect(consent.ad_user_data).toBe("denied");
    expect(consent.ad_personalization).toBe("denied");
    expect(consent.analytics_storage).toBe("granted");
  });
});

describe("gtmSnippet", () => {
  it("embeds the container id as a string literal", () => {
    expect(gtmSnippet("GTM-ABC123")).toContain('"GTM-ABC123"');
  });
});

describe("toDataLayer", () => {
  it("clears ecommerce, then nests the payload with a value", () => {
    expect(
      toDataLayer({
        name: "add_to_cart",
        eventId: "e1",
        timestamp: 0,
        payload: {
          currency: "USD",
          items: [
            { item_id: "1", item_name: "Tee", price: "24.10", quantity: 3 },
            { item_id: "2", item_name: "Cap", price: "0.1", quantity: 1 },
          ],
        },
      }),
    ).toEqual([
      { ecommerce: null },
      {
        event: "add_to_cart",
        event_id: "e1",
        ecommerce: {
          currency: "USD",
          value: 72.4,
          items: [
            { item_id: "1", item_name: "Tee", price: 24.1, quantity: 3 },
            { item_id: "2", item_name: "Cap", price: 0.1, quantity: 1 },
          ],
        },
      },
    ]);
  });

  it("pushes other events flat, without an ecommerce object", () => {
    expect(
      toDataLayer({
        name: "search",
        eventId: "e2",
        timestamp: 0,
        payload: { result_count: 3 },
      }),
    ).toEqual([{ event: "search", event_id: "e2", result_count: 3 }]);
  });
});
