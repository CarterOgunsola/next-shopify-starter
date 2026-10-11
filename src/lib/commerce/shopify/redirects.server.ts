import "server-only";
import { handleShopifyRedirects } from "@shopify/hydrogen";
import { sameSitePath } from "../discount-code";
import { buyerStorefrontClient } from "./client.server";
import { routeTemplates } from "./route-templates";

// A lookup that couldn't reach Shopify (as opposed to "no redirect").
export class RedirectLookupError extends Error {
  constructor(cause: unknown) {
    super("Shopify redirect lookup failed", { cause });
    this.name = "RedirectLookupError";
  }
}

export const REDIRECT_LOOKUP_TIMEOUT_MS = 2_000;

// Where Shopify would send a URL this site doesn't have: an admin URL
// redirect (Online Store > Navigation > URL redirects), Shopify's standard
// routes (/collections/x/products/y), or a ?redirect= / ?return_to= on an
// unknown path. Run after Next answers 404 (not-found.tsx). Same-origin
// paths only. Hydrogen turns a failed Shopify call into "no redirect"; here
// it throws RedirectLookupError instead, and a call taking over 2 seconds
// counts as failed, so callers don't remember an outage as a miss.
export async function findShopifyRedirect(
  url: string,
  buyerIp: string | undefined,
): Promise<string | null> {
  const client = await buyerStorefrontClient(buyerIp);
  let failure: unknown = null;
  const graphql: typeof client.graphql = (async (...args: unknown[]) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const result = await Promise.race([
        (client.graphql as (...a: unknown[]) => Promise<unknown>)(...args),
        new Promise((_, reject) => {
          timer = setTimeout(
            () => reject(new Error("Redirect lookup timed out")),
            REDIRECT_LOOKUP_TIMEOUT_MS,
          );
        }),
      ]);
      // Errors such as THROTTLED come back in the result, not thrown; Hydrogen
      // then reports "no redirect". That's a failed lookup too.
      const errors = (result as { errors?: unknown[] } | null)?.errors;
      if (errors?.length) failure = errors;
      return result;
    } catch (error) {
      failure = error;
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }) as typeof client.graphql;
  const watched = new Proxy(client, {
    get(target, key) {
      if (key === "graphql") return graphql;
      const value = Reflect.get(target, key, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
  const response = await handleShopifyRedirects({
    request: new Request(url),
    storefrontClient: watched,
    routeTemplates,
  });
  if (failure) throw new RedirectLookupError(failure);
  const location = response?.headers.get("location");
  if (!location) return null;
  // Same rule as every redirect on this site: a path on this site after
  // normalization, or no redirect (the 404 stands).
  return sameSitePath(location);
}

// For unmatched URLs without a ?redirect= or ?return_to= (mostly bots
// probing paths): the same lookup, by path only, remembered per server
// instance (an hour for a redirect, five minutes for none, 30 seconds after
// a failed lookup, at most 1,000 paths), so repeated scans don't each reach
// Shopify. Concurrent requests for one path share a lookup. The request's
// own query is added to the target afterwards, as Shopify does, so one
// visitor's query never reaches another; a param the target already has
// keeps the target's value.
const HIT_MS = 60 * 60_000;
const MISS_MS = 5 * 60_000;
const FAILED_MS = 30_000;
const MAX_PATHS = 1_000;
const remembered = new Map<string, { target: string | null; until: number }>();
const inFlight = new Map<string, Promise<string | null>>();

async function lookUp(
  key: string,
  url: string,
  buyerIp: string | undefined,
  now: number,
): Promise<string | null> {
  let target: string | null = null;
  let ttl = MISS_MS;
  try {
    // Looked up by the key itself, not the visitor's spelling of it, so
    // the remembered answer is the one every spelling would get (Shopify
    // handles and redirect paths are lowercase).
    // Set as the pathname: resolved as a URL, //host/x would leave the site.
    const lookup = new URL(url);
    lookup.pathname = key;
    lookup.search = "";
    target = await findShopifyRedirect(lookup.href, buyerIp);
    if (target) ttl = HIT_MS;
  } catch {
    ttl = FAILED_MS;
  }
  remembered.delete(key);
  if (remembered.size >= MAX_PATHS) {
    remembered.delete(remembered.keys().next().value!);
  }
  remembered.set(key, { target, until: now + ttl });
  return target;
}

export async function findShopifyRedirectByPath(
  url: string,
  buyerIp: string | undefined,
  now = Date.now(),
): Promise<string | null> {
  const { pathname, searchParams } = new URL(url);
  const key = pathname.toLowerCase().replace(/\/+$/, "") || "/";
  const entry = remembered.get(key);
  let target: string | null;
  if (entry && entry.until > now) {
    target = entry.target;
  } else {
    let pending = inFlight.get(key);
    if (!pending) {
      pending = lookUp(key, url, buyerIp, now).finally(() =>
        inFlight.delete(key),
      );
      inFlight.set(key, pending);
    }
    target = await pending;
  }
  if (!target) return null;
  const location = new URL(target, "https://site.invalid");
  for (const [name, value] of searchParams) {
    if (!location.searchParams.has(name)) {
      location.searchParams.append(name, value);
    }
  }
  return `${location.pathname}${location.search}${location.hash}`;
}
