// After pnpm cf:build: headers for the static files Cloudflare serves
// without running the worker (.open-next/assets), where next.config.ts's
// headers() never applies. Written into the build output rather than
// public/, so Vercel doesn't serve a stray /_headers file.
import { existsSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(import.meta.dirname, "..");

// The _headers file. `rules` are the build's headers() rules (from
// .next/routes-manifest.json): until launch (SITE_INDEXED) the noindex
// header the build set on every path is copied here, so static files say
// it too, as the build decided it.
export function assetHeaders(rules) {
  const robots = rules
    .find((rule) => rule.source === "/:path*")
    ?.headers.find((header) => header.key === "X-Robots-Tag");
  return `# Written by scripts/cloudflare-assets.mjs.
/_next/static/*
  Cache-Control: public, max-age=31536000, immutable

/*
  X-Content-Type-Options: nosniff
  Strict-Transport-Security: max-age=63072000; includeSubDomains
${robots ? `  X-Robots-Tag: ${robots.value}\n` : ""}`;
}

function main() {
  const assets = join(root, ".open-next/assets");
  const manifest = join(root, ".next/routes-manifest.json");
  if (!existsSync(assets) || !existsSync(manifest)) {
    console.error(
      "No .open-next/assets or .next/routes-manifest.json: run opennextjs-cloudflare build first.",
    );
    process.exit(1);
  }
  const { headers } = JSON.parse(readFileSync(manifest, "utf8"));
  writeFileSync(join(assets, "_headers"), assetHeaders(headers));
}

if (realpathSync(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  main();
}
