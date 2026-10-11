import { COOKIE_NAMES } from "@/lib/cookie-names";

// src/proxy.ts copies the visitor's country (from the host's geo header,
// src/lib/host/request-geo.ts) into this cookie so static pages can pick the
// consent model on the client.
export const COUNTRY_COOKIE = COOKIE_NAMES.country;

export function readCountryCookie(cookie: string): string | null {
  for (const part of cookie.split(";")) {
    const [name, value] = part.trim().split("=");
    if (name === COUNTRY_COOKIE && value) {
      // A malformed value falls back to unknown (opt-in) rather than
      // throwing during render.
      try {
        return decodeURIComponent(value);
      } catch {
        return null;
      }
    }
  }
  return null;
}
