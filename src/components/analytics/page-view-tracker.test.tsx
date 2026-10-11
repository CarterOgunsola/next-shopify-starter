// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const nav = vi.hoisted(() => ({ pathname: "/products/a" }));
const consent = vi.hoisted(() => ({ ready: true, analytics: false }));
const tracked = vi.hoisted(() => [] as unknown[]);
vi.mock("next/navigation", () => ({ usePathname: () => nav.pathname }));
vi.mock("@/lib/consent/client", () => ({
  useConsent: () => ({
    ready: consent.ready,
    state: { analytics: consent.analytics },
  }),
}));
vi.mock("@/lib/analytics/track", () => ({
  track: (name: string, payload: unknown) => tracked.push([name, payload]),
}));

const { PageViewTracker } = await import("./page-view-tracker");

const go = (path: string, query = "") => {
  nav.pathname = path;
  window.history.replaceState(null, "", `${path}${query}`);
};

beforeEach(() => {
  tracked.length = 0;
  consent.analytics = false;
  go("/products/a", "?utm_source=news&utm_campaign=fall&email=x%40y.test");
});
afterEach(cleanup);

describe("PageViewTracker", () => {
  it("sends nothing before analytics is granted", () => {
    const { rerender } = render(<PageViewTracker />);
    go("/shop");
    rerender(<PageViewTracker />);
    expect(tracked).toEqual([]);
  });

  it("sends the landing page first when analytics is granted after moving on", () => {
    const { rerender } = render(<PageViewTracker />);
    go("/shop");
    rerender(<PageViewTracker />);
    consent.analytics = true;
    rerender(<PageViewTracker />);
    expect(tracked).toEqual([
      [
        "page_view",
        {
          path: "/products/a",
          location:
            "http://localhost:3000/products/a?utm_source=news&utm_campaign=fall",
        },
      ],
      ["page_view", { path: "/shop", location: "http://localhost:3000/shop" }],
    ]);
  });

  it("sends the landing page once when granted on it", () => {
    consent.analytics = true;
    render(<PageViewTracker />);
    expect(tracked).toEqual([
      [
        "page_view",
        {
          path: "/products/a",
          location:
            "http://localhost:3000/products/a?utm_source=news&utm_campaign=fall",
        },
      ],
    ]);
  });
});
