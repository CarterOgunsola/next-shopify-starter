import { expect, test } from "./support/test";

test("titles a missing page as not found", async ({ page }) => {
  const response = await page.goto("/no-such-page");
  expect(response?.status()).toBe(404);
  await expect(page).toHaveTitle(/^Page not found \|/);
});

test("titles an order page as not found when there's no such order", async ({
  page,
}) => {
  // Not an order id: no Shopify call, the same not-found page a foreign or
  // missing order gets.
  await page.goto("/account/orders/not-a-number");
  await expect(
    page.getByRole("heading", { level: 1, name: "Page not found" }),
  ).toBeVisible();
  await expect(page).toHaveTitle(/^Page not found \|/);
});
