// Where the site runs: picks which platform headers are trusted for the
// visitor's IP (client-ip.ts), country (request-geo.ts) and public origin
// (commerce/request-origin.ts).
//
// Set by HOSTING, never guessed from headers: a client can send any header
// itself (cf-ipcountry to Vercel, x-vercel-ip-country to Cloudflare), and
// only the platform the request really came through overwrites its own.
// - unset or "vercel": Vercel (the default).
// - "cloudflare": Cloudflare Workers (wrangler.jsonc sets it).
// Anything else throws rather than trusting the wrong headers.
export const HOSTS = ["vercel", "cloudflare"] as const;

export type Host = (typeof HOSTS)[number];

export function currentHost(
  env: Record<string, string | undefined> = process.env,
): Host {
  const value = env.HOSTING?.trim().toLowerCase();
  if (!value) return "vercel";
  if ((HOSTS as readonly string[]).includes(value)) return value as Host;
  throw new Error(`HOSTING should be one of: ${HOSTS.join(", ")}.`);
}
