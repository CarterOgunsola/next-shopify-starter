import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "./support/test";

// The header and footer menus come from Shopify (the synthetic store's
// main-menu nests three levels; its footer is the dev store's).

test("opens a header menu from the keyboard and follows one of its links", async ({
  page,
}) => {
  await page.goto("/search");
  const nav = page.getByRole("navigation", { name: "Primary" });
  const shop = nav.getByRole("button", { name: "Shop" });
  await expect(shop).toHaveAttribute("aria-expanded", "false");
  await expect(nav.getByRole("link", { name: "Apparel" })).toBeHidden();

  await shop.focus();
  await page.keyboard.press("Enter");
  await expect(shop).toHaveAttribute("aria-expanded", "true");
  await expect(nav.getByRole("link", { name: "All Shop" })).toBeVisible();
  await expect(
    nav.getByRole("list", { name: "Apparel" }).getByRole("link"),
  ).toHaveText(["Test Tee"]);

  await page.keyboard.press("Escape");
  await expect(shop).toHaveAttribute("aria-expanded", "false");
  await expect(shop).toBeFocused();

  await page.keyboard.press("Space");
  await nav.getByRole("link", { name: "Apparel" }).click();
  await expect(page).toHaveURL(/\/collections\/test-apparel$/);
  await expect(shop).toHaveAttribute("aria-expanded", "false");
});

test("links other sites without passing the opener, and leaves out what has no page here", async ({
  page,
}) => {
  await page.goto("/search");
  const nav = page.getByRole("navigation", { name: "Primary" });
  await nav.getByRole("button", { name: "Help" }).click();
  await expect(nav.getByRole("link", { name: "Status" })).toHaveAttribute(
    "rel",
    "noopener",
  );
  await expect(nav.getByRole("link", { name: "Refunds" })).toHaveAttribute(
    "href",
    "/policies/refund-policy",
  );
  await expect(nav.getByRole("link", { name: "Blog" })).toHaveCount(0);
  // Search, account and cart stay this site's own.
  await expect(nav.getByRole("combobox", { name: "Search" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Account" })).toBeVisible();
});

test("shows the footer menu without repeating the legal links", async ({
  page,
}) => {
  await page.goto("/search");
  const footer = page.getByRole("navigation", { name: "Footer" });
  await expect(footer.getByRole("link")).toHaveText(["Search"]);
  await expect(
    page
      .getByRole("navigation", { name: "Legal" })
      .getByRole("link", { name: "Your Privacy Choices" }),
  ).toHaveCount(1);
});

test("an open header menu has no accessibility violations", async ({
  page,
}) => {
  await page.goto("/search");
  await page
    .getByRole("navigation", { name: "Primary" })
    .getByRole("button", { name: "Shop" })
    .click();
  const { violations } = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(
    violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(" ")}`),
  ).toEqual([]);
});
