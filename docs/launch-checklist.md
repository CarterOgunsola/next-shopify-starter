# Launch checklist

- [ ] Replace the placeholder pages and copy: the home page, `/privacy`, `/terms`, `/cookies`, `/privacy-choices` and the consent banner.
- [ ] Counsel confirms the consent policy (`src/lib/consent/policy.ts`) and approves every entry in `compliance.ts`, so `pnpm launch:check` passes.
- [ ] `SHOPIFY_CHECKOUT_DOMAIN` is the store's checkout domain, real CSP reports are clean, and `CSP_ENFORCE=1` is set.
- [ ] `SITE_INDEXED=true` once the site should be indexed. Until then every response says `noindex, nofollow` and the sitemaps 404.
- [ ] `SHOP_INDEXED=true` once the shop should be indexed (the sitemap, robots, Markdown pages and `llms.txt` follow). It needs `SITE_INDEXED`.
- [ ] Webhooks registered with `SHOPIFY_WEBHOOK_SECRET` set: Admin API `webhookSubscriptionCreate` with `uri` `https://<host>/api/webhooks/shopify` for `PRODUCTS_CREATE`, `PRODUCTS_UPDATE`, `PRODUCTS_DELETE`, `COLLECTIONS_CREATE`, `COLLECTIONS_UPDATE`, `COLLECTIONS_DELETE`, `METAOBJECTS_CREATE`, `METAOBJECTS_UPDATE`, `METAOBJECTS_DELETE` and `SHOP_UPDATE`.
- [ ] WAF rate-limit rules (Vercel WAF, or Cloudflare's rate limiting rules) for the newsletter server action, `/api/commerce/predictive-search`, `/api/commerce/browse`, `/api/mcp`, `/api/ucp/mcp` and `/discount/*`.
- [ ] The Customer Account API callback, JavaScript origin and logout URI registered for the production domain.
- [ ] Order notification emails link to `https://<site>/account/orders/{{ order.id }}` if order pages should be here (Shopify admin, Settings > Notifications).
