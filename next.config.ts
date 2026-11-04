import type { NextConfig } from "next";
import { PHASE_DEVELOPMENT_SERVER } from "next/constants";
import { DEV_TUNNEL_HOSTS } from "./src/lib/dev-tunnel";
import { e2eMode } from "./src/lib/e2e-mode";
import { robotsHeaders } from "./src/lib/indexing";
import { hostRedirects } from "./src/lib/redirect-hosts";
import { securityHeaders } from "./src/lib/security/headers";
import { requireProductionSiteUrl } from "./src/lib/site-url-guard";

const e2e = e2eMode(process.env);
// A production deploy build stops here without the site's real URL.
requireProductionSiteUrl(process.env);

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // Automatic memoization of components and hooks.
  reactCompiler: true,
  // End-to-end tests only (e2e/): a build of their own, and each test can
  // answer the server's outgoing requests.
  ...(e2e ? { distDir: ".next-e2e" } : {}),
  experimental: {
    testProxy: e2e,
  },
  // Product images use a Shopify CDN loader (ShopifyImage). This keeps the
  // default optimizer limited to Shopify's file paths if it's ever used.
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "cdn.shopify.com",
        pathname: "/s/files/**",
      },
    ],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          ...securityHeaders({
            dev: process.env.NODE_ENV !== "production",
            enforce: process.env.CSP_ENFORCE === "1",
            env: process.env,
            // The end-to-end server is plain HTTP.
            upgrade: process.env.NODE_ENV === "production" && !e2e,
          }),
          ...robotsHeaders(process.env),
        ],
      },
    ];
  },
  // REDIRECT_HOSTS: other hostnames (such as the host's own vercel.app or
  // workers.dev one) send every path to the site with a 308.
  async redirects() {
    return hostRedirects(process.env);
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

// next dev only: a quick tunnel's host may load dev assets and post server
// actions (pnpm tunnel). Never part of a production build.
export default function config(phase: string): NextConfig {
  if (phase !== PHASE_DEVELOPMENT_SERVER) return nextConfig;
  return {
    ...nextConfig,
    allowedDevOrigins: DEV_TUNNEL_HOSTS,
    experimental: {
      ...nextConfig.experimental,
      serverActions: { allowedOrigins: DEV_TUNNEL_HOSTS },
    },
  };
}
