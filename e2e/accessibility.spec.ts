import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { HttpResponse } from "msw";
import giftCardContent from "../src/lib/commerce/testing/fixtures/ProductContent.gift-card.json";
import { consentReady, expect, storefront, test } from "./support/test";

// axe against WCAG 2.2 A and AA: the main page types, then states that only
// appear after an interaction (dialogs, forms with errors, the EU banner).
// The mobile project runs them all again on a phone-sized screen.

async function noViolations(page: Page) {
  const { violations } = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(
    violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(" ")}`),
  ).toEqual([]);
}

const PAGES = [
  ["home", "/"],
  ["shop", "/shop"],
  ["collection", "/collections/test-apparel"],
  ["product", "/products/test-electrolytes"],
  ["search", "/search?q=tee"],
  ["cart", "/cart"],
  ["account", "/account"],
  ["policy", "/policies/refund-policy"],
  ["privacy", "/privacy"],
  ["terms", "/terms"],
  ["cookies", "/cookies"],
  ["privacy choices", "/privacy-choices"],
  ["missing page", "/products/test-no-such-product"],
] as const;

for (const [name, path] of PAGES) {
  test(`${name} page has no accessibility violations`, async ({ page }) => {
    await page.goto(path);
    await consentReady(page);
    await noViolations(page);
  });
}

test("the cart with items, and the open cart drawer", async ({ page }) => {
  await page.goto("/products/the-minimal-snowboard");
  const purchase = page.getByRole("region", { name: "Purchase" });
  await expect(purchase.getByText(/In stock/)).toBeVisible();
  await purchase.getByRole("button", { name: "Add to cart" }).click();
  await expect(
    page.getByRole("dialog", { name: "Your cart" }).getByRole("listitem"),
  ).toHaveCount(1);
  await noViolations(page);
  await page.goto("/cart");
  await consentReady(page);
  await noViolations(page);
});

test("the open quick add dialog", async ({ page }) => {
  await page.goto("/shop");
  await consentReady(page);
  await page
    .getByRole("button", { name: /^Quick add Test Electrolytes/ })
    .click();
  await expect(
    page
      .getByRole("dialog", { name: /Electrolytes/ })
      .getByRole("radio")
      .first(),
  ).toBeVisible();
  await noViolations(page);
});

test("the gift card form with its errors", async ({ page, shopify }) => {
  // The dev store's sample gift card is sold out: answer its live state
  // (read per request) as in stock.
  const giftCard = giftCardContent.data.product;
  shopify.use(
    storefront.query("VariantView", ({ variables }) =>
      variables.handle === "gift-card"
        ? HttpResponse.json({
            data: {
              product: {
                id: giftCard.id,
                options: giftCard.options,
                encodedVariantExistence: giftCard.encodedVariantExistence,
                encodedVariantAvailability: giftCard.encodedVariantExistence,
                selectedOrFirstAvailableVariant: {
                  ...giftCard.selectedOrFirstAvailableVariant,
                  availableForSale: true,
                },
              },
            },
          })
        : undefined,
    ),
  );
  await page.goto("/products/gift-card");
  const purchase = page.getByRole("region", { name: "Purchase" });
  await expect(purchase.getByText(/In stock/)).toBeVisible();
  await purchase
    .getByRole("checkbox", { name: "Send it to someone by email" })
    .check();
  await purchase.getByLabel("Recipient email").fill("sam");
  await purchase.getByRole("button", { name: "Add to cart" }).click();
  await expect(purchase.getByLabel("Recipient email")).toHaveAttribute(
    "aria-invalid",
    "true",
  );
  await noViolations(page);
});

test("the review form with its errors", async ({ page }) => {
  await page.goto("/products/test-tee-3-option");
  const form = page.getByRole("form", { name: "Write a review" });
  await form.getByRole("radio", { name: /5 stars/ }).check();
  await form.getByLabel("Title").fill("Great tee");
  await form
    .getByLabel("Review")
    .fill("Soft, fits well and survived the wash.");
  await form.getByLabel("Name").fill("avery@example.test");
  await form.getByLabel("Email").fill("avery@example.test");
  await form.getByRole("button", { name: "Send review" }).click();
  await expect(
    form.getByText("Enter your name, not your email."),
  ).toBeVisible();
  await noViolations(page);
});

test("the Notify me form with its error", async ({ page }) => {
  // Black / XL is sold out (recorded).
  await page.goto("/products/test-tee-3-option?color=black&size=xl");
  const form = page.getByRole("form", { name: /Get an email when/ });
  await form.getByLabel("Email", { exact: true }).fill("avery@example.test");
  await form.getByRole("button", { name: "Notify me" }).click();
  // Klaviyo is out of reach here: the form shows its error.
  await expect(form.getByRole("alert")).not.toBeEmpty();
  await noViolations(page);
});

test("the cookie banner for an EU visitor", async ({ page, baseURL }) => {
  await page
    .context()
    .addCookies([{ name: "store_country", value: "DE", url: baseURL! }]);
  await page.goto("/");
  await expect(page.getByRole("region", { name: /^Cookies on/ })).toBeVisible();
  await noViolations(page);
});
