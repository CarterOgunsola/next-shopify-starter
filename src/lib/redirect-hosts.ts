import { parsePublicEnv } from "./env";

// REDIRECT_HOSTS: exact hostnames, comma-separated, that redirect with a 308
// to the same path and query on NEXT_PUBLIC_SITE_URL, such as the host's own
// hostname (vercel.app, workers.dev) once the site has its own domain. Read
// at build in next.config.ts. No wildcards, so preview deployment URLs keep
// working, and never the site's own host, which would loop.

// Dot-separated labels of letters, digits and inner hyphens.
const HOSTNAME =
  /^(?=.{1,253}$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*$/;

type HostRedirect = {
  source: string;
  has: { type: "host"; value: string }[];
  destination: string;
  permanent: true;
};

export function hostRedirects(
  env: Record<string, string | undefined>,
): HostRedirect[] {
  const site = new URL(
    parsePublicEnv({ NEXT_PUBLIC_SITE_URL: env.NEXT_PUBLIC_SITE_URL })
      .NEXT_PUBLIC_SITE_URL,
  );
  const hosts = new Set<string>();
  for (const entry of (env.REDIRECT_HOSTS ?? "").split(",")) {
    const host = entry.trim().toLowerCase();
    if (!host) continue;
    if (!HOSTNAME.test(host)) {
      console.warn(
        `[env] REDIRECT_HOSTS: "${entry.trim()}" isn't a hostname and was ignored.`,
      );
    } else if (host === site.hostname) {
      console.warn(
        `[env] REDIRECT_HOSTS: ${host} is the site's own host (NEXT_PUBLIC_SITE_URL) and was skipped.`,
      );
    } else {
      hosts.add(host);
    }
  }
  // Next matches a host value as a regular expression, so dots are escaped.
  return [...hosts].map((host) => ({
    source: "/:path*",
    has: [{ type: "host", value: host.replaceAll(".", "\\.") }],
    destination: `${site.origin}/:path*`,
    permanent: true,
  }));
}
