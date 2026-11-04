import type { Page } from "@playwright/test";
import { expect, test } from "./support/test";

// Pages name their own canonical URL on the site's host (NEXT_PUBLIC_SITE_URL,
// this test server's origin).
async function canonical(page: Page): Promise<URL | null> {
  const links = page.locator('link[rel="canonical"]');
  if ((await links.count()) === 0) return null;
  return new URL((await links.first().getAttribute("href"))!);
}

test("the home page and a legal page name themselves as canonical", async ({
  page,
  baseURL,
}) => {
  const site = new URL(baseURL!).origin;
  for (const path of ["/", "/privacy"]) {
    await page.goto(`${path}?utm_source=test`);
    const own = await canonical(page);
    expect(own?.origin, path).toBe(site);
    expect(own?.pathname, path).toBe(path);
    expect(own?.search, path).toBe("");
  }
});

test("a missing page names no canonical URL", async ({ page }) => {
  const response = await page.goto("/no-such-page");
  expect(response?.status()).toBe(404);
  expect(await canonical(page)).toBeNull();
});
