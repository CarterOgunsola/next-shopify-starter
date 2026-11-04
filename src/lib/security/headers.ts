// Security headers and Content Security Policy, applied in next.config.ts
// (and by src/proxy.ts to what it answers itself: response-headers.ts).
//
// Report-Only by default; CSP_ENFORCE=1 (read at build) enforces the same
// policy. The end-to-end tests fail on any violation, in either mode.
//
// What stays 'unsafe-inline', and why:
// - script-src: every App Router page carries inline scripts with its own
//   data (the RSC flight payload, self.__next_f.push) and React's
//   streaming helpers, whose arguments differ per request. They can't be
//   hashed at build. A nonce would cover them, but nonces need every page
//   rendered per request, and Next documents them as incompatible with
//   Partial Prerendering (the static shells this site serves). A hash or
//   nonce in the list would also switch 'unsafe-inline' off for those
//   scripts, so none is added. 'unsafe-eval' is development only.
// - style-src: React style attributes (images' aspect boxes, the consent
//   and vendor widgets) and the vendors' injected styles.
//
// Everything else is closed: no plugins, base tag, framing or posting
// anywhere but this site and Shopify's checkout and sign-in.
//
// Vendor allowlists follow the vendors' docs; confirm them against real
// reports (and with Klaviyo and Attentive) before enforcing in production.

const VENDORS = {
  google: {
    script: ["https://www.googletagmanager.com"],
    connect: [
      "https://*.google-analytics.com",
      "https://*.analytics.google.com",
      "https://*.googletagmanager.com",
    ],
    img: ["https://*.google-analytics.com", "https://*.googletagmanager.com"],
  },
  // klaviyo.js, its onsite forms (served from several subdomains) and
  // their Google Fonts.
  klaviyo: {
    script: ["https://*.klaviyo.com"],
    connect: ["https://*.klaviyo.com"],
    img: ["https://*.klaviyo.com"],
    style: ["https://*.klaviyo.com", "https://fonts.googleapis.com"],
    font: ["https://fonts.gstatic.com"],
  },
  attentive: {
    script: ["https://cdn.attn.tv", "https://*.attn.tv"],
    connect: ["https://*.attn.tv", "https://*.attentivemobile.com"],
    img: ["https://*.attn.tv"],
    frame: ["https://*.attn.tv"],
  },
  // Shopify's storefront scripts (analytics, Customer Privacy) and product
  // media load from its CDN; analytics events go to monorail. Shop Pay and
  // customer accounts (shopify.com, where signing in and out redirects
  // after a form post) are form targets; the store's own checkout hosts
  // come from the env (checkoutHosts).
  shopify: {
    form: ["https://shop.app", "https://shopify.com"],
    script: ["https://cdn.shopify.com"],
    connect: ["https://monorail-edge.shopifysvc.com"],
    media: ["https://cdn.shopify.com"],
    img: ["https://cdn.shopify.com"],
  },
  // Embedded videos (from a CMS, say), without YouTube's cookies. Remove it if
  // the site embeds none.
  youtube: {
    frame: ["https://www.youtube-nocookie.com"],
    img: ["https://i.ytimg.com"],
  },
} as const;

type Directive =
  "script" | "connect" | "img" | "style" | "font" | "frame" | "media" | "form";

function sources(directive: Directive): string[] {
  return Object.values(VENDORS).flatMap(
    (vendor) =>
      (vendor as Partial<Record<Directive, readonly string[]>>)[directive] ??
      [],
  );
}

export const CSP_REPORT_PATH = "/api/csp-report";

// Where Buy with Shop Pay's form post redirects (form-action covers
// redirects after a post): the store's checkout, on its myshopify.com
// domain and on its checkout domain once it has one.
export function checkoutHosts(
  env: Record<string, string | undefined>,
): string[] {
  return [env.SHOPIFY_STORE_DOMAIN, env.SHOPIFY_CHECKOUT_DOMAIN]
    .map((host) => host?.trim())
    .filter((host): host is string => Boolean(host))
    .map((host) => `https://${host.replace(/^https?:\/\//, "")}`);
}

export function contentSecurityPolicy({
  dev,
  checkout = [],
  upgrade = !dev,
}: {
  dev: boolean;
  // The store's checkout hosts (checkoutHosts).
  checkout?: string[];
  // upgrade-insecure-requests: off for plain-HTTP test servers.
  upgrade?: boolean;
}): string {
  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    "script-src": [
      "'self'",
      "'unsafe-inline'",
      ...(dev ? ["'unsafe-eval'"] : []),
      ...sources("script"),
    ],
    "style-src": ["'self'", "'unsafe-inline'", ...sources("style")],
    "img-src": [
      "'self'",
      "data:",
      "blob:",
      // Development only: the synthetic store's images (pnpm dev:synthetic
      // serves them on another port).
      ...(dev ? ["http://localhost:*"] : []),
      ...sources("img"),
    ],
    "font-src": ["'self'", ...sources("font")],
    "media-src": ["'self'", ...sources("media")],
    "connect-src": ["'self'", ...sources("connect")],
    "frame-src": ["'self'", ...sources("frame")],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'", ...checkout, ...sources("form")],
    "frame-ancestors": ["'none'"],
    ...(upgrade ? { "upgrade-insecure-requests": [] } : {}),
    "report-uri": [CSP_REPORT_PATH],
    "report-to": ["csp"],
  };
  return Object.entries(directives)
    .map(([name, values]) => [name, ...values].join(" "))
    .join("; ");
}

export function securityHeaders({
  dev,
  enforce = false,
  env = {},
  upgrade = !dev,
}: {
  dev: boolean;
  // CSP_ENFORCE=1: block what the policy doesn't allow, not just report it.
  enforce?: boolean;
  // SHOPIFY_STORE_DOMAIN and SHOPIFY_CHECKOUT_DOMAIN, for form-action.
  env?: Record<string, string | undefined>;
  upgrade?: boolean;
}) {
  // Enforcing without the checkout domain would block Buy with Shop Pay's
  // redirect to checkout once the store has its own domain.
  if (enforce && !env.SHOPIFY_CHECKOUT_DOMAIN?.trim()) {
    throw new Error(
      "CSP_ENFORCE=1 needs SHOPIFY_CHECKOUT_DOMAIN (the store's checkout domain).",
    );
  }
  const checkout = checkoutHosts(env);
  return [
    {
      key: enforce
        ? "Content-Security-Policy"
        : "Content-Security-Policy-Report-Only",
      value: contentSecurityPolicy({ dev, checkout, upgrade }),
    },
    { key: "Reporting-Endpoints", value: `csp="${CSP_REPORT_PATH}"` },
    {
      key: "Strict-Transport-Security",
      value: "max-age=63072000; includeSubDomains",
    },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    {
      key: "Permissions-Policy",
      value: "camera=(), microphone=(), geolocation=(), browsing-topics=()",
    },
    { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  ];
}
