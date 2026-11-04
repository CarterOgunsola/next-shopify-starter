import type { Page } from "@playwright/test";
import { consentReady, expect, test } from "./support/test";

// An open modal dialog holds the page still behind it (data-lock-scroll in
// globals.css), and the page scrolls again however the dialog closes.
const root = (page: Page) => page.locator("html");

test("holds the page still behind quick add and cookie preferences", async ({
  page,
}) => {
  await page.goto("/shop");
  await consentReady(page);
  await expect(root(page)).toHaveCSS("overflow-y", "visible");

  await page
    .getByRole("button", { name: /^Quick add Test Electrolytes/ })
    .click();
  const quickAdd = page.getByRole("dialog", { name: /Electrolytes/ });
  await expect(quickAdd.getByRole("radio").first()).toBeVisible();
  await expect(root(page)).toHaveCSS("overflow-y", "hidden");
  await page.keyboard.press("Escape");
  await expect(quickAdd).toBeHidden();
  await expect(root(page)).toHaveCSS("overflow-y", "visible");

  await page.getByRole("button", { name: "Cookie settings" }).click();
  const preferences = page.getByRole("dialog", { name: "Cookie preferences" });
  await expect(preferences).toBeVisible();
  await expect(root(page)).toHaveCSS("overflow-y", "hidden");
  await page.keyboard.press("Escape");
  await expect(preferences).toBeHidden();
  await expect(root(page)).toHaveCSS("overflow-y", "visible");
});

test("holds the page still behind the cart", async ({ page }) => {
  await page.goto("/products/the-minimal-snowboard");
  const purchase = page.getByRole("region", { name: "Purchase" });
  await expect(purchase.getByText(/In stock/)).toBeVisible();
  await purchase.getByRole("button", { name: "Add to cart" }).click();
  const cart = page.getByRole("dialog", { name: "Your cart" });
  await expect(cart.getByRole("listitem")).toHaveCount(1);
  await expect(root(page)).toHaveCSS("overflow-y", "hidden");
  await page.keyboard.press("Escape");
  await expect(cart).toBeHidden();
  await expect(root(page)).toHaveCSS("overflow-y", "visible");

  await page.getByRole("button", { name: "Cart, 1 item" }).click();
  await expect(root(page)).toHaveCSS("overflow-y", "hidden");
  await cart.getByRole("button", { name: "Close" }).click();
  await expect(cart).toBeHidden();
  await expect(root(page)).toHaveCSS("overflow-y", "visible");
});
