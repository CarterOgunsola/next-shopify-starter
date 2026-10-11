import { HttpResponse } from "msw";
import navy from "../src/lib/commerce/testing/fixtures/CollectionListing.test-apparel.navy-price-asc.json";
import { consentReady, expect, storefront, test } from "./support/test";

test("filters a collection, then goes back to the full listing", async ({
  page,
  shopify,
}) => {
  // Filtered listings are read at request time: answer them with the
  // recorded Navy listing.
  shopify.use(
    storefront.query("CollectionListing", ({ variables }) =>
      (variables.filters as unknown[] | undefined)?.length
        ? HttpResponse.json(navy)
        : undefined,
    ),
  );
  await page.goto("/collections/test-apparel");
  const products = page.getByRole("list", { name: "Products" });
  await expect(products.getByRole("article")).toHaveCount(2);

  await page.getByRole("checkbox", { name: /^Navy/ }).click();
  await expect(page).toHaveURL(/filter\.v\.option\.color=Navy/i);
  await expect(products.getByRole("article")).toHaveCount(1);

  await page.goBack();
  await expect(page).toHaveURL(/\/collections\/test-apparel$/);
  await expect(products.getByRole("article")).toHaveCount(2);
  await expect(page.getByRole("checkbox", { name: /^Navy/ })).not.toBeChecked();
});

test("suggests products while typing and opens one", async ({ page }) => {
  await page.goto("/");
  const search = page.getByRole("combobox", { name: "Search" });
  await search.fill("test");
  const products = page.getByRole("group", { name: "Products" });
  await expect(products.getByRole("option").first()).toBeVisible();
  await expect(search).toHaveAttribute("aria-expanded", "true");
  await search.press("ArrowDown");
  const first = page.getByRole("option").first();
  await expect(first).toHaveAttribute("aria-selected", "true");
  await search.press("Enter");
  await expect(page).not.toHaveURL(/\/$/);
});

test("asks EU visitors for cookie consent, not US visitors", async ({
  page,
  baseURL,
}) => {
  await page
    .context()
    .addCookies([{ name: "store_country", value: "DE", url: baseURL! }]);
  await page.goto("/");
  const banner = page.getByRole("region", { name: /^Cookies on/ });
  await expect(banner).toBeVisible();
  await banner.getByRole("button", { name: "Reject all" }).click();
  await expect(banner).toBeHidden();

  await page.context().clearCookies();
  await page
    .context()
    .addCookies([{ name: "store_country", value: "US", url: baseURL! }]);
  await page.goto("/");
  await consentReady(page);
  await expect(banner).toBeHidden();
});

test("sends a signed-out visitor from their orders to sign in", async ({
  page,
}) => {
  await page.goto("/account/orders");
  await expect(page.getByText("Sign in to see your orders.")).toBeVisible();
  const signIn = page.getByRole("main").getByRole("link", { name: "Sign in" });
  // Back to the orders page afterwards, linking the cart on the way.
  await expect(signIn).toHaveAttribute(
    "href",
    `/account/login?return_to=${encodeURIComponent(
      `/account/link-cart?return_to=${encodeURIComponent("/account/orders")}`,
    )}`,
  );
  // Shopify's sign-in needs HTTPS; this server is plain HTTP, so sign-in
  // stops here and says why instead of failing at Shopify.
  await signIn.click();
  await expect(page).toHaveURL(/\/account\?login=https$/);
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "Sign-in needs a secure (HTTPS) connection.",
  );
});
