// A deploy needs the site's real URL: canonical URLs, robots.txt, the
// sitemaps, Open Graph URLs and the REDIRECT_HOSTS target all come from
// NEXT_PUBLIC_SITE_URL, and its default points at a local dev server. On a
// deploy build this throws from next.config.ts, which fails the build and
// leaves the previous deployment live. Which builds count (never NODE_ENV:
// every next build is production):
// - Vercel: production builds (VERCEL_ENV). Previews keep the default.
// - Cloudflare: every Workers Builds build (WORKERS_CI), since production
//   and preview builds share its build variables, and pnpm cf:deploy
//   (CF_DEPLOY, which the script sets). HOSTING alone doesn't count:
//   pnpm cf:build sets it for CI's build-only check and pnpm cf:preview too.
// Local builds, CI and the tests keep the default.

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

const WHERE_TO_SET = {
  vercel: "in the Vercel project's Production environment variables",
  cloudflare:
    "as a build variable in Workers Builds, or in the environment pnpm cf:deploy runs in",
};

export function requireProductionSiteUrl(
  env: Record<string, string | undefined>,
): void {
  const host = deployHost(env);
  if (!host) return;
  const problem = siteUrlProblem(env.NEXT_PUBLIC_SITE_URL?.trim());
  if (!problem) return;
  throw new Error(
    `NEXT_PUBLIC_SITE_URL ${problem}. A production build needs the site's public https URL: set NEXT_PUBLIC_SITE_URL ${WHERE_TO_SET[host]}, then redeploy.`,
  );
}

function deployHost(
  env: Record<string, string | undefined>,
): keyof typeof WHERE_TO_SET | null {
  if (env.VERCEL_ENV === "production") return "vercel";
  if (env.WORKERS_CI === "1" || env.CF_DEPLOY === "1") return "cloudflare";
  return null;
}

function siteUrlProblem(value: string | undefined): string | null {
  if (!value) return "isn't set";
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return `isn't a URL ("${value}")`;
  }
  if (url.protocol !== "https:") return `isn't https ("${value}")`;
  const host = url.hostname.toLowerCase();
  if (LOCAL_HOSTS.has(host) || host.endsWith(".localhost")) {
    return `points at this machine ("${value}")`;
  }
  return null;
}
