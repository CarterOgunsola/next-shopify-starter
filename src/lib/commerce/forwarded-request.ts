import { cleanUrl } from "@/lib/analytics/clean-url";

// What reaches Shopify from a visitor's request: only the headers and
// cookies Shopify's storefront uses, never the rest (our own cookies from
// lib/cookie-names.ts with the cart id and customer session, Vercel's
// preview and deployment cookies, other vendors' cookies, authorization or
// platform headers).
// Hydrogen's own proxies then apply their per-route lists on top.

const HEADERS = new Set(
  [
    "accept",
    "accept-encoding",
    "accept-language",
    "content-type",
    "content-length",
    "cookie",
    "origin",
    "referer",
    "user-agent",
    "sec-gpc",
    "purpose",
    "sec-purpose",
    // Hydrogen tells page requests from API calls by it (Accept otherwise).
    "sec-fetch-dest",
    "access-control-request-headers",
    "access-control-request-method",
    "x-requested-with",
    // Shopify's browser scripts.
    "x-shopify-storefront-access-token",
    "x-shopify-uniquetoken",
    "x-shopify-visittoken",
    "shopify-storefront-consent-management",
    "custom-storefront-request-group-id",
    "mcp-session-id",
    "mcp-protocol-version",
    // Our own public origin, which Hydrogen's account routes read when a
    // proxy sits in front.
    "x-forwarded-proto",
    "x-forwarded-host",
  ].map((name) => name.toLowerCase()),
);

// Shopify's storefront cookies (shopify.dev cookie list): the _shopify_*
// family, consent and the legacy session pair.
const COOKIE =
  /^(_shopify_[\w]+|_tracking_consent|_cmp_a|_s|_y|localization|keep_alive)$/;

export function forwardableHeaders(incoming: Headers): Headers {
  const headers = new Headers();
  for (const [name, value] of incoming) {
    if (HEADERS.has(name.toLowerCase())) headers.set(name, value);
  }
  const cookie = incoming.get("cookie");
  if (cookie) {
    const kept = cookie
      .split(";")
      .map((part) => part.trim())
      .filter((part) => part && COOKIE.test(part.split("=")[0]));
    if (kept.length) headers.set("cookie", kept.join("; "));
    else headers.delete("cookie");
  }
  // The page the browser was on, as analytics may see it: a search page's
  // Referer would carry the search term.
  const referer = incoming.get("referer");
  if (referer) {
    const clean = cleanPageUrl(referer);
    if (clean) headers.set("referer", clean);
    else headers.delete("referer");
  }
  return headers;
}

// A full URL or a path, cleaned (cleanUrl), in the same form; null if it
// can't be read.
function cleanPageUrl(value: string): string | null {
  try {
    if (value.startsWith("/")) {
      const base = "https://site.invalid";
      return cleanUrl(new URL(value, base).href).slice(base.length);
    }
    return cleanUrl(value);
  } catch {
    return null;
  }
}

// What Shopify's browser scripts send about the page through our proxy:
// the consent script records the landing page and the original referrer
// (location and document.referrer, query and all) with each consent it sets
// through the Storefront API, and Shopify's event collector takes page and
// referrer URLs. Those are cleaned the same way as analytics URLs, so a
// search term or filter value never reaches Shopify.

// Keys that hold a page or referrer URL, as GraphQL arguments or variables.
const PAGE_KEYS = /^(landingPage|origReferrer|referrer|referer)$/i;
const INLINE_ARGUMENT =
  /\b(landingPage|origReferrer|referrer|referer)(\s*:\s*)("""[\s\S]*?"""|"(?:[^"\\]|\\.)*")/gi;

// A GraphQL string literal's value: "..." (JSON-like escapes) or a """
// block string; null if it can't be read.
function graphqlString(literal: string): string | null {
  if (literal.startsWith('"""')) return literal.slice(3, -3).trim();
  try {
    return JSON.parse(literal) as string;
  } catch {
    return null;
  }
}

function cleanQueryText(query: string): string {
  return query.replace(
    INLINE_ARGUMENT,
    (_, key: string, colon: string, literal: string) => {
      const value = graphqlString(literal);
      const clean = (value !== null && cleanPageUrl(value)) || "/";
      return `${key}${colon}${JSON.stringify(clean)}`;
    },
  );
}

// Page and referrer keys in GraphQL variables.
function cleanVariables(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(cleanVariables);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, inner]) =>
      PAGE_KEYS.test(key) && typeof inner === "string"
        ? [key, cleanPageUrl(inner) ?? "/"]
        : [key, cleanVariables(inner)],
    ),
  );
}

type GraphqlBody = { query?: unknown; variables?: unknown };

function cleanOperation(operation: GraphqlBody): GraphqlBody {
  if (!operation || typeof operation !== "object") return operation;
  return {
    ...operation,
    ...(typeof operation.query === "string"
      ? { query: cleanQueryText(operation.query) }
      : {}),
    ...(operation.variables !== undefined
      ? { variables: cleanVariables(operation.variables) }
      : {}),
  };
}

// A Storefront API body: one operation or a batch of them.
export function cleanStorefrontBody(text: string): string {
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return text;
  }
  if (!body || typeof body !== "object") return text;
  const clean = Array.isArray(body)
    ? body.map((operation) => cleanOperation(operation as GraphqlBody))
    : cleanOperation(body as GraphqlBody);
  const out = JSON.stringify(clean);
  return out === JSON.stringify(body) ? text : out;
}

// A Storefront API GET: the query and variables are in the URL.
function cleanStorefrontSearch(url: URL): URL {
  const out = new URL(url);
  const query = out.searchParams.get("query");
  if (query !== null) out.searchParams.set("query", cleanQueryText(query));
  const variables = out.searchParams.get("variables");
  if (variables !== null) {
    try {
      out.searchParams.set(
        "variables",
        JSON.stringify(cleanVariables(JSON.parse(variables))),
      );
    } catch {
      // Not JSON: Shopify will refuse it anyway.
    }
  }
  return out;
}

// An event collector body: field names vary by event, so every string
// that is a URL (or a path) with a query is cleaned, whatever its key.
function cleanUrlsIn(value: unknown): unknown {
  if (typeof value === "string") {
    return /^(https?:\/\/|\/)[^\s]*\?/.test(value)
      ? (cleanPageUrl(value) ?? value)
      : value;
  }
  if (Array.isArray(value)) return value.map(cleanUrlsIn);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, inner]) => [key, cleanUrlsIn(inner)]),
  );
}

export function cleanEventBody(text: string): string {
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return text;
  }
  const out = JSON.stringify(cleanUrlsIn(body));
  return out === JSON.stringify(body) ? text : out;
}

const STOREFRONT_API = /^\/api\/(unstable|\d{4}-\d{2})\/graphql\.json$/;
// Shopify's event collector and generic API proxy (Hydrogen's interceptors).
const EVENT_PATHS =
  /^(\/\.well-known\/shopify\/fec\/produce$|\/__shopify(\/|$))/;

export async function forwardableRequest(request: Request): Promise<Request> {
  const headers = forwardableHeaders(request.headers);
  const url = new URL(request.url);
  const storefront = STOREFRONT_API.test(url.pathname);
  const events = EVENT_PATHS.test(url.pathname);
  if ((storefront || events) && request.method === "GET") {
    const target = storefront ? cleanStorefrontSearch(url) : url;
    return new Request(target, { method: "GET", headers });
  }
  if ((storefront || events) && request.body) {
    const text = await request.text();
    const body = storefront ? cleanStorefrontBody(text) : cleanEventBody(text);
    headers.delete("content-length");
    return new Request(url, { method: request.method, headers, body });
  }
  return new Request(request, { headers });
}
