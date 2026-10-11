import { expect, test } from "./support/test";

// Every end-to-end test fails on a Content Security Policy violation.

test("serves the policy as this run asked", async ({ page }) => {
  const response = await page.goto("/");
  const headers = response!.headers();
  // pnpm test:e2e:csp must run against an enforcing build, not a reused
  // report-only one.
  if (process.env.CSP_ENFORCE === "1") {
    expect(headers["content-security-policy"]).toBeTruthy();
    expect(headers["content-security-policy-report-only"]).toBeUndefined();
  } else {
    expect(headers["content-security-policy-report-only"]).toBeTruthy();
  }
});

test("catches a Content Security Policy violation", async ({
  page,
  shopify,
}) => {
  await page.goto("/");
  await page.evaluate(() => {
    const image = document.createElement("img");
    image.src = "https://not-allowed.example/pixel.png";
    document.body.append(image);
  });
  await expect
    .poll(() => shopify.cspViolations.join("\n"))
    .toContain("img-src blocked https://not-allowed.example/pixel.png");
  shopify.cspViolations.length = 0;
});

test("lets Buy with Shop Pay's form post go on to the store's checkout", async ({
  page,
}) => {
  // Stand in for Shopify's checkout.
  await page.route("https://synthetic-store.myshopify.com/**", (route) =>
    route.fulfill({ body: "checkout", contentType: "text/plain" }),
  );
  await page.goto("/products/the-minimal-snowboard");
  const purchase = page.getByRole("region", { name: "Purchase" });
  await expect(purchase.getByText(/In stock/)).toBeVisible();
  await purchase.getByRole("button", { name: "Buy with Shop Pay" }).click();
  await expect(page).toHaveURL(
    /^https:\/\/synthetic-store\.myshopify\.com\/cart\/c\/.*payment=shop_pay/,
  );
});
