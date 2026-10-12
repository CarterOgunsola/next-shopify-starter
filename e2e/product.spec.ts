import { expect, test } from "./support/test";

// Product page journeys. Each test uses its own product where it can, so a
// cached read from one test never stands in for another's.

test("selects the variant named in the URL", async ({ page }) => {
  await page.goto("/products/test-electrolytes?flavor=berry&size=30+ct");
  const purchase = page.getByRole("region", { name: "Purchase" });
  await expect(purchase.getByRole("radio", { name: "Berry" })).toBeChecked();
  await expect(purchase.getByRole("radio", { name: "30 ct" })).toBeChecked();
  await expect(purchase.getByText("$42.00 · In stock")).toBeVisible();
});

test("adds the chosen variant to the cart", async ({ page }) => {
  await page.goto("/products/test-tee-3-option");
  const purchase = page.getByRole("region", { name: "Purchase" });
  await expect(purchase.getByText(/In stock/)).toBeVisible();
  await purchase.getByRole("button", { name: "Add to cart" }).click();
  const drawer = page.getByRole("dialog", { name: "Your cart" });
  const lines = drawer.getByRole("list", { name: "Items in your cart" });
  await expect(lines.getByRole("listitem")).toHaveCount(1);
  await expect(lines).toContainText("Test Tee");
});

test("adds a subscription with its delivery plan", async ({ page }) => {
  await page.goto("/products/selling-plans-ski-wax");
  const purchase = page.getByRole("region", { name: "Purchase" });
  await purchase.getByRole("radio", { name: /Subscribe and save/ }).check();
  await purchase.getByRole("button", { name: "Add to cart" }).click();
  const lines = page
    .getByRole("dialog", { name: "Your cart" })
    .getByRole("list", { name: "Items in your cart" });
  await expect(lines).toContainText("Selling Plans Ski Wax");
  await expect(
    lines.getByRole("checkbox", { name: /Subscribe and save on/ }),
  ).toBeChecked();
});

test("answers 404 for a product that doesn't exist", async ({ page }) => {
  const response = await page.goto("/products/test-no-such-product");
  expect(response?.status()).toBe(404);
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    /not found|couldn.t find/i,
  );
});
