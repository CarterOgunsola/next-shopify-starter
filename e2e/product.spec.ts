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

test("shows a product's Prop 65 warning before any add from a listing", async ({
  page,
}) => {
  await page.goto("/shop");
  // The recorded subscription-only product carries a Prop 65 warning: no
  // one-click Add on its tile, and the dialog shows the warning.
  const quick = page.getByRole("button", {
    name: "Quick add Test Creatine (subscription only)",
  });
  await expect(
    page.getByRole("button", {
      name: "Add Test Creatine (subscription only) to cart",
    }),
  ).toHaveCount(0);
  await quick.click();
  const dialog = page.getByRole("dialog", { name: /Creatine/ });
  await expect(
    dialog.getByRole("region", { name: "California Proposition 65 warning" }),
  ).toContainText("lead");
});

test("shows a product's Prop 65 warning before its purchase controls", async ({
  page,
}) => {
  await page.goto("/products/test-subscription-only");
  const warning = page.getByRole("region", {
    name: "California Proposition 65 warning",
  });
  await expect(warning).toContainText("lead");
  const button = page
    .getByRole("region", { name: "Purchase" })
    .getByRole("button")
    .first();
  await expect(button).toBeVisible();
  const before = await warning.evaluate(
    (node, other) =>
      Boolean(
        node.compareDocumentPosition(other!) & Node.DOCUMENT_POSITION_FOLLOWING,
      ),
    await button.elementHandle(),
  );
  expect(before).toBe(true);
});
