import { parseServerEnv } from "./env";

// Until launch (SITE_INDEXED), every response asks search engines not to
// index it or follow its links: pages, route handlers, error pages and
// static files. Applied to every path in next.config.ts, so it's read at
// build and turning the flag on needs a redeploy. Pages say the same in
// their robots meta tag. On Cloudflare, static files skip next.config.ts:
// scripts/cloudflare-assets.mjs copies the header into their _headers.
// What src/proxy.ts answers itself skips it there too, so the proxy adds it
// (response-headers.ts).
export function robotsHeaders(
  env: Record<string, string | undefined>,
): { key: string; value: string }[] {
  return parseServerEnv(env).SITE_INDEXED
    ? []
    : [{ key: "X-Robots-Tag", value: "noindex, nofollow" }];
}
