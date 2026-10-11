import type { Page } from "@playwright/test";
import { getResponse, type RequestHandler } from "msw";
import { graphql } from "msw/graphql";
import { expect, test as base } from "next/experimental/testmode/playwright";
import { createStore, isStorefrontRequest } from "./synthetic-store.mjs";

export { expect } from "next/experimental/testmode/playwright";

// The Storefront API on the synthetic store, any API version: for
// shopify.use(storefront.query("Name", resolver)).
export const storefront = graphql.link(
  /^https:\/\/synthetic-store\.myshopify\.com\/api\/[\w-]+\/graphql\.json$/,
);

// Waits until the page's consent is known (and with it, hydration).
export async function consentReady(page: Page) {
  await page.locator("html[data-consent=ready]").waitFor({ state: "attached" });
}

type Shopify = {
  // Answer an operation differently in this test (MSW handlers, e.g.
  // graphql.link(...).query("Name", resolver)). Only for request-time
  // reads and cart calls: cached reads would keep the answer for others.
  use(...handlers: RequestHandler[]): void;
  // Content Security Policy violations so far; the test fails if any are
  // left at its end.
  cspViolations: string[];
};

// Each test's server-side Storefront API requests go to its own synthetic
// store (its own cart). Anything else the server fetches is left to the
// preload, which refuses outside hosts. In the browser, requests to any
// other host (Shopify's CDN scripts and images, vendor tags) are blocked.
export const test = base.extend<{ shopify: Shopify }>({
  shopify: [
    async ({ next, page, context, baseURL, javaScriptEnabled }, use) => {
      const local = new URL(baseURL!).origin;
      // Content Security Policy violations, from every document the test
      // opens (fired in report-only mode too): any fails the test.
      const violations: string[] = [];
      await context.exposeBinding(
        "__cspViolation",
        (_source, violation: string) => void violations.push(violation),
      );
      // On the context, so popups and new tabs report too.
      await context.addInitScript(() => {
        document.addEventListener("securitypolicyviolation", (event) => {
          (
            window as unknown as { __cspViolation(v: string): void }
          ).__cspViolation(
            `${event.effectiveDirective} blocked ${event.blockedURI || "inline"} on ${location.pathname}${event.sample ? `: ${event.sample}` : ""}`,
          );
        });
      });
      await page.route(
        (url) => url.origin !== local,
        (route) => route.abort("blockedbyclient"),
      );
      const store = createStore();
      const handlers: RequestHandler[] = [];
      next.onFetch(async (request) => {
        if (!isStorefrontRequest(request.url)) return "continue";
        const mocked = handlers.length
          ? await getResponse(handlers, request.clone())
          : undefined;
        if (mocked) return mocked;
        return Response.json(store.respond(await request.json()));
      });
      await use({
        use: (...more) => handlers.unshift(...more),
        cspViolations: violations,
      });
      // Let a violation from the test's last action arrive (the browser
      // reports it asynchronously). Nothing to wait for without scripts.
      if (javaScriptEnabled) {
        await page
          .evaluate(
            () =>
              new Promise((resolve) =>
                requestAnimationFrame(() => setTimeout(resolve, 50)),
              ),
          )
          .catch(() => {});
      }
      expect(violations, "Content Security Policy violations").toEqual([]);
    },
    { auto: true },
  ],
});
