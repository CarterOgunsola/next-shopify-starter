import type { Page } from "@playwright/test";
import { consentReady, expect, test } from "./support/test";

// Shopify's analytics events for the landing page, through Hydrogen's real
// analytics bus. Shopify's CDN scripts can't load here, so a stand-in for
// its Customer Privacy API answers (the parts Hydrogen's bus reads), and a
// test destination on the bus records what would be sent.
const PRIVACY_STAND_IN = `(() => {
  const shopify = (window.Shopify = window.Shopify || {});
  let consent = null;
  window.__consentsToShopify = [];
  shopify.customerPrivacy = Object.assign(shopify.customerPrivacy || {}, {
    consentStatus: "loaded",
    setTrackingConsent(next, done) {
      consent = next;
      window.__consentsToShopify.push(next);
      document.dispatchEvent(new CustomEvent("visitorConsentCollected"));
      if (done) done({});
      return Promise.resolve();
    },
    currentVisitorConsent: () => ({
      analytics: consent ? (consent.analytics ? "yes" : "no") : "",
    }),
    analyticsProcessingAllowed: () => Boolean(consent && consent.analytics),
    shouldShowGDPRBanner: () => false,
    __internal: {
      uniqueToken: () => "synthetic-unique-token",
      visitToken: () => "synthetic-visit-token",
    },
  });
  document.dispatchEvent(new CustomEvent("consentTrackingApiLoaded"));
})();`;

const LANDING =
  "/products/the-minimal-snowboard?utm_source=e2e&utm_campaign=landing&gclid=synthetic-click&email=someone%40example.test";

type Seen = { event: string; url: string; token: string };

async function land(page: Page) {
  await page.route(
    "https://cdn.shopify.com/shopifycloud/consent-tracking-api/**",
    (route) =>
      route.fulfill({
        body: PRIVACY_STAND_IN,
        contentType: "text/javascript",
      }),
  );
  await page.goto(LANDING);
  await consentReady(page);
  await page.waitForFunction(() => Boolean(window.Shopify?.analytics));
  await page.evaluate(() => {
    const seen: Seen[] = [];
    (window as unknown as { __seen: Seen[] }).__seen = seen;
    (
      window.Shopify!.analytics as unknown as {
        addDestination(destination: unknown): void;
      }
    ).addDestination({
      name: "e2e",
      setup({
        subscribe,
      }: {
        subscribe(
          event: string,
          listener: (
            payload: { url?: string },
            context: { getTrackingValues(): { uniqueToken: string } },
          ) => void,
        ): void;
      }) {
        for (const event of ["page_viewed", "product_viewed"]) {
          subscribe(event, (payload, context) =>
            seen.push({
              event,
              url: payload.url ?? "",
              token: context.getTrackingValues().uniqueToken,
            }),
          );
        }
      },
    });
  });
}

const seen = (page: Page) =>
  page.evaluate(() => (window as unknown as { __seen: Seen[] }).__seen);
const consentsToShopify = (page: Page) =>
  page.evaluate(
    () =>
      (window as unknown as { __consentsToShopify: unknown[] })
        .__consentsToShopify,
  );

test("sends the landing page's views, with its campaign params, once the visitor accepts", async ({
  page,
}) => {
  await land(page);
  // Opt-in here (no region): nothing leaves before a decision.
  await page.waitForTimeout(500);
  expect(await seen(page)).toEqual([]);
  expect(await consentsToShopify(page)).toEqual([]);

  await page.getByRole("button", { name: "Accept all" }).click();
  await expect.poll(() => seen(page)).toHaveLength(2);
  const events = await seen(page);
  expect(events.map((e) => e.event).sort()).toEqual([
    "page_viewed",
    "product_viewed",
  ]);
  for (const event of events) {
    const url = new URL(event.url);
    expect(url.pathname).toBe("/products/the-minimal-snowboard");
    // Campaign params kept, everything else dropped.
    expect(url.search).toBe(
      "?utm_source=e2e&utm_campaign=landing&gclid=synthetic-click",
    );
    // Read after consent.
    expect(event.token).toBe("synthetic-unique-token");
  }
});

test("discards the landing page's views when the visitor rejects", async ({
  page,
}) => {
  await land(page);
  await page.getByRole("button", { name: "Reject all" }).click();
  await expect
    .poll(() => consentsToShopify(page))
    .toEqual([expect.objectContaining({ analytics: false })]);
  await page.waitForTimeout(500);
  expect(await seen(page)).toEqual([]);
});

test("sends nothing while the visitor hasn't decided", async ({ page }) => {
  await land(page);
  await page.waitForTimeout(1500);
  expect(await seen(page)).toEqual([]);
  expect(await consentsToShopify(page)).toEqual([]);
});
