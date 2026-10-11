import { expect, test } from "./support/test";

test.use({ javaScriptEnabled: false });

test("shows the price and options without JavaScript", async ({ page }) => {
  await page.goto("/products/the-complete-snowboard");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "The Complete Snowboard",
  );
  await expect(page.getByText("$699.95").first()).toBeVisible();
});
