import "server-only";
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import { COOKIE_NAMES } from "@/lib/cookie-names";

// The customer session (OAuth tokens and state) in one encrypted HttpOnly
// cookie. AES-256-GCM: a tampered or foreign cookie fails to decrypt and
// reads as signed out. Tokens never reach the browser in readable form.

export const CUSTOMER_COOKIE = COOKIE_NAMES.customer;

export const CUSTOMER_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: true,
  sameSite: "lax",
  path: "/",
  // The refresh token outlives this; a new sign-in starts a new session.
  maxAge: 30 * 24 * 60 * 60,
} as const;

// Browsers drop cookies over 4096 bytes, so a session too big for one is
// split across the customer cookie and its .1, .2 and .3 chunks, each well under.
export const MAX_COOKIE_BYTES = 3800;
export const MAX_CHUNKS = 4;

const chunkName = (index: number) =>
  index === 0 ? CUSTOMER_COOKIE : `${CUSTOMER_COOKIE}.${index}`;

export type SessionData = Record<string, unknown>;

const key = (secret: string) => createHash("sha256").update(secret).digest();

export function sealSession(data: SessionData, secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(secret), iv);
  const body = Buffer.concat([
    cipher.update(JSON.stringify(data), "utf8"),
    cipher.final(),
  ]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64url");
}

export function openSession(
  value: string | undefined,
  secret: string,
): SessionData {
  if (!value) return {};
  try {
    const raw = Buffer.from(value, "base64url");
    const decipher = createDecipheriv(
      "aes-256-gcm",
      key(secret),
      raw.subarray(0, 12),
    );
    decipher.setAuthTag(raw.subarray(12, 28));
    const json = Buffer.concat([
      decipher.update(raw.subarray(28)),
      decipher.final(),
    ]);
    const data = JSON.parse(json.toString("utf8"));
    return data && typeof data === "object" ? (data as SessionData) : {};
  } catch {
    return {};
  }
}

export function readCookie(
  header: string | null,
  name: string,
): string | undefined {
  for (const part of header?.split(";") ?? []) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return rest.join("=");
  }
  return undefined;
}

// The sealed session from its chunks, read in order until one is missing.
export function readSessionValue(
  get: (name: string) => string | undefined,
): string | undefined {
  const first = get(chunkName(0));
  if (!first) return undefined;
  let value = first;
  for (let index = 1; index < MAX_CHUNKS; index++) {
    const part = get(chunkName(index));
    if (!part) break;
    value += part;
  }
  return value;
}

// The session's cookies: one per chunk in use, and empty ones (maxAge 0)
// that clear the chunks not in use, or all of them when the session is
// empty. A session too big even for every chunk is dropped (the customer
// signs in again) rather than failing the request.
export function sessionCookieWrites(
  data: SessionData,
  secret: string,
): { name: string; value: string; maxAge: number }[] {
  const sealed = Object.keys(data).length ? sealSession(data, secret) : "";
  if (sealed.length > MAX_COOKIE_BYTES * MAX_CHUNKS) {
    console.warn(
      "[accounts] customer session too large for its cookies; cleared.",
    );
  }
  const chunks =
    sealed && sealed.length <= MAX_COOKIE_BYTES * MAX_CHUNKS
      ? (sealed.match(new RegExp(`.{1,${MAX_COOKIE_BYTES}}`, "g")) ?? [])
      : [];
  return Array.from({ length: MAX_CHUNKS }, (_, index) => ({
    name: chunkName(index),
    value: chunks[index] ?? "",
    maxAge: chunks[index] ? CUSTOMER_COOKIE_OPTIONS.maxAge : 0,
  }));
}

// The same as Set-Cookie header values, for responses built by hand.
export function sessionSetCookies(data: SessionData, secret: string): string[] {
  const attributes = `Path=${CUSTOMER_COOKIE_OPTIONS.path}; HttpOnly; Secure; SameSite=Lax`;
  return sessionCookieWrites(data, secret).map(
    ({ name, value, maxAge }) =>
      `${name}=${value}; ${attributes}; Max-Age=${maxAge}`,
  );
}
