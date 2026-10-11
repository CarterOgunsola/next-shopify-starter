import { currentHost, type Host } from "./host";

// The visitor's country (ISO 3166-1 alpha-2) from the host's geo header, for
// the consent region (src/proxy.ts). Undefined when unknown, which the
// consent layer treats as opt-in, the strict model.
//
// Trust it only on the host named here: the platform's edge sets and
// overwrites its own header, but a request that reaches the app another way
// (a direct origin URL, another proxy in front) can carry any value.
export const GEO_HEADERS: Record<Host, string> = {
  vercel: "x-vercel-ip-country",
  // Cloudflare also has request.cf.country; the header is the same value
  // and keeps this independent of the adapter.
  cloudflare: "cf-ipcountry",
};

// Cloudflare's codes for no country: XX (unknown) and T1 (Tor).
const NOT_A_COUNTRY = new Set(["XX", "T1"]);

export function requestCountry(
  headers: Headers,
  host: Host = currentHost(),
): string | undefined {
  const value = headers.get(GEO_HEADERS[host])?.trim().toUpperCase();
  if (!value || !/^[A-Z]{2}$/.test(value) || NOT_A_COUNTRY.has(value)) {
    return undefined;
  }
  return value;
}
