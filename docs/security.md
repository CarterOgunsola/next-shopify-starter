# Security

## Security headers and CSP

Every route gets the headers from `src/lib/security/headers.ts` (applied in `next.config.ts`): HSTS (two years, subdomains), `nosniff`, `X-Frame-Options: DENY`, a `strict-origin-when-cross-origin` referrer policy, a Permissions-Policy that turns off camera, microphone, geolocation and Topics, and `Cross-Origin-Opener-Policy: same-origin`.

The Content Security Policy is **report-only** by default; `CSP_ENFORCE=1` (read at build) enforces the same policy. Reports go to `/api/csp-report`, which logs only the directive and the blocked origin. Every end-to-end test fails on a violation, and `pnpm test:e2e:csp` runs the suite with the policy enforced.

- `script-src` keeps `'unsafe-inline'`: App Router pages carry inline scripts (the RSC payload and streaming helpers) that can't be hashed at build, and nonces need every page rendered per request, which rules out Partial Prerendering.
- Forms post only to this site, the store's checkout (`SHOPIFY_STORE_DOMAIN`, `SHOPIFY_CHECKOUT_DOMAIN`), Shop Pay and customer accounts. Enforcing needs `SHOPIFY_CHECKOUT_DOMAIN`; the build fails without it.
- Vendor allowlists (GTM/GA4, Klaviyo, Attentive, YouTube nocookie) follow the vendors' docs. Check real reports before enforcing, and remove what you don't use.

`pnpm build` ends with `scripts/check-client-secrets.mjs`, which fails if a server secret (or a server-only auth header name) appears in client JS or prerendered pages. It never prints secret values.
