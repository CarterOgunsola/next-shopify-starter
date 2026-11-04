import { HttpResponse } from "msw";
import { API_VERSION } from "../src/lib/commerce/api-version";
import { expect, storefront, test } from "./support/test";

// Until launch (SITE_INDEXED, off in this build) every response asks search
// engines not to index it or follow its links.
const NOINDEX = "noindex, nofollow";

test("keeps pages out of search until launch", async ({ page }) => {
  const response = await page.goto("/");
  expect(response!.headers()["x-robots-tag"]).toBe(NOINDEX);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
    "content",
    NOINDEX,
  );
});

test("keeps static files, route handlers and missing pages out of search", async ({
  page,
}) => {
  await page.goto("/");
  const script = await page
    .locator('script[src^="/_next/static/"]')
    .first()
    .getAttribute("src");
  for (const [path, status] of [
    [script!, 200],
    ["/robots.txt", 200],
    ["/no-such-page", 404],
    ["/sitemap.xml", 404],
    ["/sitemap-shop.xml", 404],
    ["/llms.txt", 404],
  ] as const) {
    const response = await page.goto(path);
    expect(response!.status(), path).toBe(status);
    expect(response!.headers()["x-robots-tag"], path).toBe(NOINDEX);
  }
});

test("keeps route handler answers out of search, errors included", async ({
  page,
  shopify,
}) => {
  await page.goto("/");
  const variant = () =>
    page.evaluate(async () => {
      const response = await fetch("/api/commerce/variant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          handle: "the-minimal-snowboard",
          selection: {},
        }),
      });
      return {
        status: response.status,
        robots: response.headers.get("x-robots-tag"),
      };
    });
  expect(await variant()).toEqual({ status: 200, robots: NOINDEX });
  // Shopify down: live variant state is read per request, so it's a 503.
  shopify.use(storefront.query("VariantView", () => HttpResponse.error()));
  expect(await variant()).toEqual({ status: 503, robots: NOINDEX });
});

// src/proxy.ts adds the next.config.ts headers to what it answers itself,
// since Cloudflare skips them there (docs/deploy-cloudflare.md). next start
// applies them as well, so each must still go out once.
test("keeps what src/proxy.ts answers out of search", async ({ page }) => {
  // Shopify's UCP business profile, proxied (no Next route has this path).
  const profile = await page.goto("/.well-known/ucp");
  expect(profile!.status()).toBe(200);
  expect(await profile!.json()).toEqual({ name: "Synthetic", services: [] });
  expect(profile!.headers()["x-robots-tag"]).toBe(NOINDEX);
  const sent = (await profile!.headersArray()).map(({ name }) =>
    name.toLowerCase(),
  );
  for (const name of [
    "x-robots-tag",
    "x-frame-options",
    "strict-transport-security",
    "content-security-policy-report-only",
  ]) {
    expect(
      sent.filter((header) => header === name),
      name,
    ).toHaveLength(1);
  }
  // The Storefront API proxy that Shopify's browser scripts call.
  await page.goto("/");
  const api = await page.evaluate(async (path) => {
    const response = await fetch(path, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Storefront-Access-Token": "synthetic-public-token",
      },
      body: JSON.stringify({ query: "query ShopId { shop { id } }" }),
    });
    const { data } = await response.json();
    return {
      status: response.status,
      shop: Boolean(data?.shop?.id),
      robots: response.headers.get("x-robots-tag"),
    };
  }, `/api/${API_VERSION}/graphql.json`);
  expect(api).toEqual({ status: 200, shop: true, robots: NOINDEX });
});

test("lets crawlers in, with no sitemap, until launch", async ({ page }) => {
  const response = await page.goto("/robots.txt");
  const robots = await response!.text();
  expect(robots).toContain("Allow: /");
  expect(robots).not.toContain("Sitemap:");
});
