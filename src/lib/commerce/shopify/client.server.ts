import "server-only";
import {
  createShopifyRequestContext,
  createStorefrontClient,
  StorefrontApiError,
  StorefrontTimeoutError,
  type GqlRestParam,
  type StorefrontApi,
  type StorefrontClient,
} from "@shopify/hydrogen";
import { cookies, headers } from "next/headers";
import { connection } from "next/server";
import {
  decodeVisitorConsent,
  VISITOR_CONSENT_COOKIE,
  type VisitorConsent,
} from "@/lib/consent/visitor-consent";
import { gpcFromHeader } from "@/lib/consent/gpc";
import { limitForGpc } from "@/lib/consent/policy";
import {
  analyticsEnv,
  API_VERSION,
  commerceEnv,
  STORE_LOCALE,
} from "../config.server";
import { forwardableHeaders } from "../forwarded-request";
import {
  isTransient,
  ShopifyError,
  ShopifyRequestError,
  ShopifyTransientError,
} from "./errors";

// The one way to call the Storefront API. Hydrogen's client with the private
// token, plus our error classes and logging. Uncached: callers in
// catalog.server.ts decide what may be cached.

export const TIMEOUT_MS = 10_000;
const SLOW_MS = 2_000;

type RequestOptions = {
  // The visitor's IP, for buyer-driven calls (cart, live price and stock,
  // search) so Shopify rate-limits and bot-checks per buyer. Leave it out
  // for shared reads that run inside "use cache".
  buyerIp?: string;
};

// The visitor's own request headers for a buyer-driven call: Shopify's
// cookies (its session and attribution), Sec-GPC and the like reach
// Shopify as they would from a Liquid storefront. Our own cookies
// (lib/cookie-names.ts) never do. Empty outside a request (scripts, tests
// without one).
async function visitorHeaders(): Promise<Headers> {
  try {
    return forwardableHeaders(await headers());
  } catch {
    return new Headers();
  }
}

// The Headless channel's storefront id, so Shopify attributes the calls to
// it. "0" is the analytics placeholder for "not set".
function storefrontId(): string | undefined {
  const id = analyticsEnv().storefrontId;
  return id && id !== "0" ? id : undefined;
}

// The visitor's consent for a buyer-driven call, from our consent cookie,
// with the request's Sec-GPC applied on top (it's binding whatever the
// cookie says, as in the consent layer). Undefined outside a request or
// before the visitor's choice is known; Shopify then reads Sec-GPC itself.
async function visitorConsent(): Promise<VisitorConsent | undefined> {
  try {
    const [jar, incoming] = await Promise.all([cookies(), headers()]);
    const consent = decodeVisitorConsent(
      jar.get(VISITOR_CONSENT_COOKIE)?.value,
    );
    return consent && gpcFromHeader(incoming.get("sec-gpc"))
      ? limitForGpc(consent)
      : consent;
  } catch {
    return undefined;
  }
}

// Shopify answers with the API version it actually served. A different one
// means 2026-10 is no longer supported (from 2027-10-16) or was never
// available, and Shopify fell back: logged once per server instance.
let versionWarned = false;
export function checkApiVersion(served: string | null): void {
  if (!served || served === API_VERSION || versionWarned) return;
  versionWarned = true;
  console.warn(
    `[shopify] Storefront API served version ${served}, not ${API_VERSION}. Upgrade before ${API_VERSION} support ends.`,
  );
}

const versionCheckedFetch: typeof fetch = async (input, init) => {
  const response = await fetch(input, init);
  checkApiVersion(response.headers.get("x-shopify-api-version"));
  return response;
};

let sharedClient: StorefrontClient | undefined;

function clientConfig() {
  const { storeDomain, privateToken } = commerceEnv();
  return {
    storeDomain,
    privateStorefrontToken: privateToken,
    storefrontId: storefrontId(),
    apiVersion: API_VERSION,
    defaultTimeoutInMs: TIMEOUT_MS,
    fetch: versionCheckedFetch,
  };
}

// Shared reads (inside "use cache"): one client, no buyer, built without
// awaiting anything, so prerendering never waits on request data.
function sharedStorefrontClient(): StorefrontClient {
  sharedClient ??= createStorefrontClient({
    type: "private_no_buyer_context",
    requestContext: createShopifyRequestContext({
      request: { headers: new Headers() },
      i18n: STORE_LOCALE,
    }),
    config: clientConfig(),
  });
  return sharedClient;
}

// Buyer-driven calls: a client per call with the visitor's IP and headers.
// Also for Hydrogen helpers that take a client (Shopify URL redirects).
export async function buyerStorefrontClient(
  buyerIp: string | undefined,
): Promise<StorefrontClient> {
  if (!buyerIp) return sharedStorefrontClient();
  // Request time only: a prerender (including Next's runtime prerender of
  // a page that reads searchParams) would start this call and abort it,
  // and Hydrogen's request context needs randomness.
  await connection();
  return createStorefrontClient({
    type: "private",
    requestContext: createShopifyRequestContext({
      request: { headers: await visitorHeaders() },
      i18n: STORE_LOCALE,
      buyerIp,
    }),
    config: clientConfig(),
  });
}

export async function storefrontRequest<
  const Doc extends StorefrontApi.DocumentNode,
>(
  doc: Doc,
  ...rest: GqlRestParam<Doc, RequestOptions>
): Promise<StorefrontApi.ResultOf<Doc>> {
  const operation = operationName(String(doc));
  const { buyerIp, ...given } = (rest[0] ?? {}) as RequestOptions & {
    variables?: Record<string, unknown>;
  };
  // Buyer calls whose document takes $visitorConsent (the cart) get the
  // visitor's choice, so Shopify carries it into checkout.
  const consent =
    buyerIp &&
    String(doc).includes("$visitorConsent") &&
    given.variables?.visitorConsent === undefined
      ? await visitorConsent()
      : undefined;
  const options = consent
    ? { ...given, variables: { ...given.variables, visitorConsent: consent } }
    : given;
  const started = performance.now();
  const elapsed = () => Math.round(performance.now() - started);

  let result;
  try {
    const client = buyerIp
      ? await buyerStorefrontClient(buyerIp)
      : sharedStorefrontClient();
    result = await client.graphql(doc, ...([options] as GqlRestParam<Doc>));
  } catch (error) {
    throw logFailure(toShopifyError(operation, error), elapsed());
  }

  if (result.errors?.length) {
    const codes = result.errors.map((error) =>
      String(error.extensions?.code ?? "GRAPHQL_ERROR"),
    );
    const ErrorClass = codes.includes("THROTTLED")
      ? ShopifyTransientError
      : ShopifyRequestError;
    // Shopify's messages are schema errors, useful while developing. Kept
    // out of production logs in case one ever echoes a variable.
    const detail =
      process.env.NODE_ENV === "production"
        ? ""
        : `: ${result.errors.map((error) => error.message).join("; ")}`;
    throw logFailure(
      new ErrorClass(operation, `GraphQL errors ${codes.join(", ")}${detail}`, {
        codes,
      }),
      elapsed(),
    );
  }

  const ms = elapsed();
  if (ms > SLOW_MS) console.warn(`[shopify] ${operation} slow: ${ms}ms`);
  return result.data as StorefrontApi.ResultOf<Doc>;
}

// "query ProductContent($handle: String!) ..." -> "ProductContent".
export function operationName(doc: string): string {
  return /\b(?:query|mutation)\s+([A-Za-z_]\w*)/.exec(doc)?.[1] ?? "anonymous";
}

export function toShopifyError(operation: string, error: unknown): unknown {
  if (error instanceof StorefrontTimeoutError) {
    return new ShopifyTransientError(
      operation,
      `timed out after ${error.timeoutInMs}ms`,
      { cause: error },
    );
  }
  if (error instanceof StorefrontApiError) {
    const details = {
      status: error.status,
      requestId: error.requestId,
      cause: error,
    };
    if (error.status === undefined) {
      return new ShopifyTransientError(operation, "network error", details);
    }
    const ErrorClass = isTransient(error.status)
      ? ShopifyTransientError
      : ShopifyRequestError;
    return new ErrorClass(operation, `HTTP ${error.status}`, details);
  }
  // Caller aborts, missing config and programming errors pass through.
  return error;
}

function logFailure(error: unknown, ms: number): unknown {
  if (error instanceof ShopifyError) {
    const request = error.requestId ? `, request ${error.requestId}` : "";
    console.warn(
      `[shopify] ${error.name}: ${error.message} (${ms}ms${request})`,
    );
  }
  return error;
}
