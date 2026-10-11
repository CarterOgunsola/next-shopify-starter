// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { publishConsent, resetConsentSignal } from "@/lib/consent/signal";
import type { ConsentState } from "@/lib/consent/types";
import {
  clearRecentlyViewed,
  recentlyViewed,
  recordProductView,
  resetRecentlyViewedWatch,
  watchRecentlyViewedConsent,
} from "./recently-viewed";

const consent = (preferences: boolean): ConsentState => ({
  necessary: true,
  preferences,
  analytics: false,
  marketing: false,
  saleOfData: true,
  gpc: false,
  decided: true,
});

afterEach(() => {
  resetConsentSignal();
  resetRecentlyViewedWatch();
  window.localStorage.clear();
});

describe("recently viewed", () => {
  it("keeps handles only, newest first, without repeats, up to eight", async () => {
    publishConsent(consent(true));
    for (const handle of ["a", "b", "a", "c", "d", "e", "f", "g", "h", "i"]) {
      await recordProductView(handle);
    }
    await recordProductView("Not A Handle");
    expect(await recentlyViewed()).toEqual([
      "i",
      "h",
      "g",
      "f",
      "e",
      "d",
      "c",
      "a",
    ]);
    expect(JSON.parse(window.localStorage.getItem("recently-viewed")!)).toEqual(
      ["i", "h", "g", "f", "e", "d", "c", "a"],
    );
  });

  it("keeps nothing without preferences consent", async () => {
    publishConsent(consent(false));
    await recordProductView("a");
    expect(window.localStorage.length).toBe(0);
    window.localStorage.setItem("recently-viewed", '["a"]');
    expect(await recentlyViewed()).toEqual([]);
  });

  it("is cleared when preferences consent is withdrawn", async () => {
    publishConsent(consent(true));
    watchRecentlyViewedConsent();
    await recordProductView("a");
    publishConsent(consent(false));
    expect(window.localStorage.getItem("recently-viewed")).toBeNull();
  });

  it("ignores what isn't a list of handles", async () => {
    publishConsent(consent(true));
    window.localStorage.setItem("recently-viewed", '["a", 7, "../x", "b"]');
    expect(await recentlyViewed()).toEqual(["a", "b"]);
    window.localStorage.setItem("recently-viewed", "{");
    expect(await recentlyViewed()).toEqual([]);
    clearRecentlyViewed();
    expect(window.localStorage.getItem("recently-viewed")).toBeNull();
  });
});
