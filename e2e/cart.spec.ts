import type { Page } from "@playwright/test";
import { expect, test } from "./support/test";

const PRODUCT = "The Minimal Snowboard";

// The cart page's discount field. Visible only: while the cart streams in,
// the server-rendered form can sit in a hidden boundary next to the one on
// screen.
const codeField = (page: Page) =>
  page.getByLabel("Discount code or gift card code").filter({ visible: true });

async function cartWithOne(page: Page) {
  await page.goto("/products/the-minimal-snowboard");
  const purchase = page.getByRole("region", { name: "Purchase" });
  await expect(purchase.getByText(/In stock/)).toBeVisible();
  await purchase.getByRole("button", { name: "Add to cart" }).click();
  await expect(
    page.getByRole("dialog", { name: "Your cart" }).getByRole("listitem"),
  ).toHaveCount(1);
  await page.goto("/cart");
}

test("changes a line's quantity and the subtotal follows", async ({ page }) => {
  await cartWithOne(page);
  await page
    .getByRole("button", { name: `Increase quantity of ${PRODUCT}` })
    .click();
  await expect(page.getByRole("spinbutton")).toHaveValue("2");
  await expect(page.getByText("$1,771.90").first()).toBeVisible();
});

test("applies a discount code and explains one that isn't valid", async ({
  page,
}) => {
  await cartWithOne(page);
  const code = codeField(page);
  await code.fill("NOPE123");
  await page.getByRole("button", { name: "Apply" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toHaveText(
    "That code isn't a valid discount code or gift card.",
  );

  await code.fill("TEST10");
  await page.getByRole("button", { name: "Apply" }).click();
  await expect(
    page.getByRole("list", { name: "Discount codes on your cart" }),
  ).toContainText("TEST10");
  // The cart shows the discount taken off: its total below its subtotal.
  const amount = async (term: string) =>
    Number(
      (
        await page
          .getByRole("term")
          .filter({ hasText: new RegExp(`^${term}$`) })
          .locator("xpath=following-sibling::dd[1]")
          .innerText()
      ).replace(/[^0-9.]/g, ""),
    );
  await expect
    .poll(async () => (await amount("Total")) < (await amount("Subtotal")))
    .toBe(true);
});

test("checks out on the store's checkout", async ({ page }) => {
  await cartWithOne(page);
  // Stand in for Shopify's checkout page.
  await page.route("https://synthetic-store.myshopify.com/**", (route) =>
    route.fulfill({ body: "checkout", contentType: "text/plain" }),
  );
  await page.getByRole("link", { name: "Check out", exact: true }).click();
  await expect(page).toHaveURL(
    /^https:\/\/synthetic-store\.myshopify\.com\/cart\/c\/syntheticCart[0-9a-f]{12}\?key=/,
  );
});

test("applies a gift card to what's left to pay", async ({ page }) => {
  await cartWithOne(page);
  await codeField(page).fill("SYNTHETICGIFT0000");
  await page.getByRole("button", { name: "Apply" }).click();
  const cards = page.getByRole("list", { name: "Gift cards on your cart" });
  // The recorded card's $50 balance, all of it on this $885.95 order.
  await expect(cards).toContainText(
    "Gift card ending 0000: $50.00 used on this order, $0.00 left on the card",
  );
  await expect(
    cards.getByRole("button", { name: "Remove gift card ending 0000" }),
  ).toBeVisible();
});
