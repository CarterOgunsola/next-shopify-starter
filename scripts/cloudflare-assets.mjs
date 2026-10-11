// After pnpm cf:build: headers for the static files Cloudflare serves
// without running the worker (.open-next/assets), where next.config.ts's
// headers() never applies. Written into the build output rather than
// public/, so Vercel doesn't serve a stray /_headers file.
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const assets = join(import.meta.dirname, "../.open-next/assets");
if (!existsSync(assets)) {
  console.error("No .open-next/assets: run opennextjs-cloudflare build first.");
  process.exit(1);
}

writeFileSync(
  join(assets, "_headers"),
  `# Written by scripts/cloudflare-assets.mjs.
/_next/static/*
  Cache-Control: public, max-age=31536000, immutable

/*
  X-Content-Type-Options: nosniff
  Strict-Transport-Security: max-age=63072000; includeSubDomains
`,
);
