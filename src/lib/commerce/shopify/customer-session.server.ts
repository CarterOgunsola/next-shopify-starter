import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import {
  createCustomerAccountServerHandlers,
  createCustomerSession,
  type ReadonlyCustomerSessionManager,
  type WritableCustomerSessionManager,
} from "@shopify/hydrogen/customer-account";
import { cookies } from "next/headers";
import { customerAccountEnv } from "../config.server";
import { requestOrigin } from "../request-origin";
import { legacyId } from "./ids";
import { refusalText } from "./operations/customer";
import { fetchShopId } from "./operations/shop";
import {
  CUSTOMER_COOKIE,
  CUSTOMER_COOKIE_OPTIONS,
  openSession,
  readCookie,
  readSessionValue,
  sessionCookieWrites,
  sessionSetCookies,
  type SessionData,
} from "./session-cookie";

// Hydrogen's customer session (OAuth with PKCE against Shopify's Customer
// Account API) on our encrypted cookie. Tokens stay server-side.

let shopId: Promise<string> | null = null;
let failedAt = 0;

// How long one lookup may take, and how long a failure is remembered so a
// Shopify outage doesn't make every request wait again.
export const SHOP_ID_TIMEOUT_MS = 3_000;
export const SHOP_ID_RETRY_MS = 30_000;

// The numeric shop id the Customer Account endpoints are built from. Looked
// up once per server instance. A failed or slow lookup fails fast for the
// next 30 seconds, then is tried again.
export function getShopId(now = Date.now()): Promise<string> {
  if (!shopId && now - failedAt < SHOP_ID_RETRY_MS) {
    return Promise.reject(new Error("Shop id lookup failed recently"));
  }
  shopId ??= Promise.race([
    fetchShopId(),
    new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error("Shop id lookup timed out")),
        SHOP_ID_TIMEOUT_MS,
      ),
    ),
  ])
    .then((gid) => {
      const id = legacyId(gid);
      if (!id) throw new Error("Shopify returned no shop id");
      return id;
    })
    .catch((error: unknown) => {
      shopId = null;
      failedAt = Date.now();
      throw error;
    });
  return shopId;
}

// What Shopify's token endpoint said during one request (sign-in or a
// refresh): the grant, and its status or why there was none.
export type TokenOutcome = {
  grant?: string;
  status?: number;
  failure?: string;
};
const tokenOutcome = new AsyncLocalStorage<TokenOutcome>();

// Runs fn, recording its token requests.
export async function recordTokenRequests<T>(
  fn: () => T | Promise<T>,
): Promise<{ result: T; outcome: TokenOutcome }> {
  const outcome: TokenOutcome = {};
  const result = await tokenOutcome.run(outcome, fn);
  return { result, outcome };
}

// Hydrogen's token requests, logged and recorded: the grant and status, and
// Shopify's error when it refused (scrubbed; never a token).
export const tokenFetch: typeof fetch = async (input, init) => {
  const grant =
    init?.body instanceof URLSearchParams
      ? (init.body.get("grant_type") ?? undefined)
      : undefined;
  const record = tokenOutcome.getStore();
  try {
    const response = await fetch(input, init);
    if (record) Object.assign(record, { grant, status: response.status });
    if (!response.ok) {
      const body = await response
        .clone()
        .text()
        .catch(() => "");
      console.warn(
        `[accounts] token ${grant ?? "request"} answered ${response.status}: ${refusalText(body) || "(no body)"}`,
      );
    }
    return response;
  } catch (error) {
    const failure = error instanceof Error ? error.name : typeof error;
    if (record) Object.assign(record, { grant, failure });
    console.warn(`[accounts] token ${grant ?? "request"} failed: ${failure}`);
    throw error;
  }
};

// After /account/refresh: a refresh Shopify couldn't complete for now
// (network, timeout, 5xx, throttling) keeps the session, so the page can
// offer to try again. One Shopify answered without a usable token being
// saved won't get better: the session's cookies are cleared, and the page
// asks the customer to sign in again. (A 400 or 401, Hydrogen clears
// itself.)
export function settleRefresh(
  response: Response,
  outcome: TokenOutcome,
  secret: string,
): Response {
  if (outcome.status === undefined && outcome.failure === undefined) {
    console.warn("[accounts] refresh: no token request (no refresh token).");
    return response;
  }
  const passing =
    outcome.failure !== undefined ||
    outcome.status === 429 ||
    (outcome.status ?? 0) >= 500;
  if (passing) {
    console.warn(
      `[accounts] refresh failed for now (${outcome.failure ?? outcome.status}); session kept.`,
    );
    return response;
  }
  const written = response.headers
    .getSetCookie()
    .some((cookie) => cookie.startsWith(`${CUSTOMER_COOKIE}=`));
  if (written) return response;
  console.warn(
    `[accounts] refresh answered ${outcome.status} without a usable token; session cleared.`,
  );
  const headers = new Headers(response.headers);
  for (const cookie of sessionSetCookies({}, secret)) {
    headers.append("Set-Cookie", cookie);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

let session: ReturnType<typeof createCustomerSession> | null = null;
let sessionClientId: string | null = null;

export async function getCustomerSession() {
  const env = customerAccountEnv();
  if (!env) return null;
  if (!session || sessionClientId !== env.clientId) {
    session = createCustomerSession({
      shopId: await getShopId(),
      customerAccountApiClientId: env.clientId,
      fetch: tokenFetch,
    } as Parameters<typeof createCustomerSession>[0]);
    sessionClientId = env.clientId;
  }
  return session;
}

// For the account route handlers: reads the request's cookie, and commit()
// returns the Set-Cookie for the response.
export function writableSessionManager(
  request: Request,
  secret: string,
): WritableCustomerSessionManager {
  const header = request.headers.get("cookie");
  const data: SessionData = openSession(
    readSessionValue((name) => readCookie(header, name)),
    secret,
  );
  let changed = false;
  return {
    getSessionOrigin: () => requestOrigin(request),
    getSessionItem: (key) => data[key],
    setSessionItem: (key, value) => {
      data[key] = value;
      changed = true;
    },
    removeSessionItem: (key) => {
      delete data[key];
      changed = true;
    },
    commit: () => {
      if (!changed) return undefined;
      const headers = new Headers();
      for (const cookie of sessionSetCookies(data, secret)) {
        headers.append("Set-Cookie", cookie);
      }
      return headers;
    },
  };
}

// For pages: reads only, so a page can never refresh tokens (the refresh
// route does that, where it can set the cookie).
export async function readonlySessionManager(
  secret: string,
): Promise<ReadonlyCustomerSessionManager> {
  const jar = await cookies();
  const data = openSession(
    readSessionValue((name) => jar.get(name)?.value),
    secret,
  );
  return { getSessionItem: (key) => data[key] };
}

// For server actions, which can set cookies: reads the session from the
// request's cookies, and save() writes it back if it changed (a token
// refresh). Pages use the read-only manager.
export async function cookieSessionManager(
  secret: string,
  origin: string,
): Promise<WritableCustomerSessionManager & { save(): Promise<void> }> {
  const jar = await cookies();
  const data: SessionData = openSession(
    readSessionValue((name) => jar.get(name)?.value),
    secret,
  );
  let changed = false;
  return {
    getSessionOrigin: () => origin,
    getSessionItem: (key) => data[key],
    setSessionItem: (key, value) => {
      data[key] = value;
      changed = true;
    },
    removeSessionItem: (key) => {
      delete data[key];
      changed = true;
    },
    async save() {
      if (!changed) return;
      for (const { name, value, maxAge } of sessionCookieWrites(data, secret)) {
        jar.set(name, value, { ...CUSTOMER_COOKIE_OPTIONS, maxAge });
      }
      changed = false;
    },
  };
}

// /account/login, /account/authorize, /account/refresh, /account/logout.
export async function customerAccountHandlers() {
  const customerSession = await getCustomerSession();
  if (!customerSession) return null;
  return createCustomerAccountServerHandlers({
    customerSession,
    origin: requestOrigin,
    defaultPostLoginRedirectPathname: "/account",
    loginFailedRedirectPath: "/account?login=failed",
    postLogoutRedirectUri: "/",
  });
}
