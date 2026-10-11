// The shapes of this site's routes (src/app), so the proxy can tell a URL
// no route will match before Next routes it. A test keeps this in step with
// the app directory. Metadata files (robots.txt, sitemap.xml) and Next's
// own paths are included.
const ROUTES = [
  /^\/$/,
  /^\/(shop|search|cart|cookies|privacy|terms|privacy-choices)$/,
  /^\/(products|collections|policies)\/[^/]+$/,
  /^\/cart\/(checkout|buy-now)$/,
  /^\/account(\/orders(\/[^/]+)?|\/link-cart|\/profile|\/addresses)?$/,
  /^\/discount\/[^/]+$/,
  /^\/api\//,
  /^\/sitemap-shop(\.xml|\/[^/]+\/[^/]+)$/,
  /^\/(robots\.txt|sitemap\.xml|favicon\.ico|llms\.txt)$/,
  /^\/md\/[^/]+\/[^/]+$/,
  /^\/_next\//,
];

export function isAppRoute(pathname: string): boolean {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  return ROUTES.some((route) => route.test(path));
}
