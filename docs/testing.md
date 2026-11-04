# Testing

## Testing layers

- **Unit and integration** (`pnpm test`, Vitest). Transforms are fed recorded Storefront API fixtures (`src/lib/commerce/testing/fixtures`); operations run against MSW, which fails any request no test handles. Tests never touch the network.
- **Fixture checks** (`fixtures.test.ts`). Fixtures may hold only the synthetic store's domain, tokens and ids, emails at example domains and documentation IPs.
- **End to end** (`pnpm test:e2e`, Playwright). A production build served against a synthetic store built from the same fixtures, with axe accessibility checks on desktop and phone sizes. Nothing reaches the network. See [`e2e/README.md`](../e2e/README.md).
- **Performance** (`pnpm perf`). Core Web Vitals and script size per page against `e2e/perf/budgets.json`, on a throttled phone.
- **CI** (`.github/workflows/ci.yml`). Every push to `main` and every pull request runs `pnpm gate` and the build, the end-to-end suite with the CSP in report-only and enforced modes, and `pnpm cf:build` (build only, nothing is deployed). A change that only touches `docs/` or Markdown skips those jobs, and a skipped job counts as passed, so checks that branch protection requires don't wait on it. None of it needs Shopify secrets. `pnpm perf` stays local, since shared runners make its timings noisy.
- **Live deploy** (`pnpm smoke <url>`). GET requests against a deployment on either host, checking what `next start` can't show: the noindex header on pages, static files, 404s and what `src/proxy.ts` answers, `robots.txt`, the sitemaps, canonical URLs and `REDIRECT_HOSTS`. Flags say which launch steps are done (see the [launch checklist](launch-checklist.md)).
- **Live** (`pnpm test:live`, `pnpm fixtures:record`). Cart contract tests and the fixture recorder run against your dev store with `.env.local`.

## Seeding a dev store

The recorded fixtures come from a dev store holding Shopify's generated sample products (`the-complete-snowboard`, `selling-plans-ski-wax`, `gift-card` and the rest) plus synthetic test products whose handles start with `test-`. To re-record fixtures or run the live tests against your own dev store:

1. Generate Shopify's sample data in the dev store.
2. Create the `test-` products and collections that `src/lib/commerce/testing/fixtures.record.ts` reads: a tee with three options, a product with an optional subscription, a subscription-only product, a sold-out product, one with 150 variants, and so on. The existing fixtures show each one's options and settings. Use made-up data only.
3. Create the discount codes `TEST10` (10% off) and `TEST5OFF` ($5 off a subtotal of $50 or more).
4. Publish everything to the Headless channel, then run `pnpm fixtures:record` and review the diff.

The recorder replaces your store's domain, tokens and visitor ids with synthetic stand-ins and refuses anything that looks like an email address or phone number. Never commit real customer or order data.
