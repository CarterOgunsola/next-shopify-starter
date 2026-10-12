# Setup

## 1. Shopify dev store

Create a development store in the Shopify Partner Dashboard, or use a Plus sandbox store. Shopify's generated sample products are enough to browse; see [Seeding a dev store](testing.md#seeding-a-dev-store) for the products the fixtures and tests expect.

## 2. Headless channel tokens

Install Shopify's **Headless** sales channel, create a storefront, and publish your products and collections to it. From the storefront's settings:

- `SHOPIFY_STORE_DOMAIN`: the `*.myshopify.com` host, without `https://`.
- `SHOPIFY_PRIVATE_ACCESS_TOKEN`: the private Storefront API token (server only).
- `NEXT_PUBLIC_SHOPIFY_PUBLIC_ACCESS_TOKEN`: the public token, for Shopify's browser analytics and consent scripts.
- `SHOPIFY_STOREFRONT_ID`: the storefront id, for analytics attribution.

Turn on the Storefront API permissions the site reads (products, collections and tags, inventory for "Only N left", selling plans, metaobjects, menus, checkouts), then set `SHOP_ENABLED=true` and restart. Metafields read on the storefront (reviews, badges) need storefront access set to `PUBLIC_READ` in their definitions.

## 3. Customer Account API

In the Headless storefront's **Customer Account API** settings, copy the client id into `SHOPIFY_CUSTOMER_CLIENT_ID`, and set `CUSTOMER_ACCOUNT_SESSION_SECRET` to 32 or more random characters (`openssl rand -base64 48`). Without both, `/account` says accounts aren't available.

Shopify signs customers in only over HTTPS on a registered origin. Locally, run `pnpm dev:https`, which serves `https://local.tryhydrogen.dev:4747` (a Shopify domain that resolves to your machine; Next writes a local certificate to `certificates/`), and register:

| Setting           | Value                                                  |
| ----------------- | ------------------------------------------------------ |
| Callback URI      | `https://local.tryhydrogen.dev:4747/account/authorize` |
| JavaScript origin | `https://local.tryhydrogen.dev`                        |
| Logout URI        | `https://local.tryhydrogen.dev:4747/`                  |

Or put a Cloudflare quick tunnel in front of `pnpm dev`: `pnpm tunnel` prints the steps, and `pnpm tunnel <tunnel URL>` prints the values to register and checks that sign-in starts. In production, register the same three paths on your domain.
