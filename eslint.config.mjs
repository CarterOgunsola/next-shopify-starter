import { dirname, relative, resolve } from "node:path";
import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// Module boundaries: Shopify only inside src/lib/commerce/shopify, a CMS SDK only
// inside src/lib/content, the consent vendor only inside src/lib/consent.
const shopify = {
  group: ["@shopify/*"],
  message: "Import from @/lib/commerce instead.",
};
const commerceInternals = {
  group: ["@/lib/commerce/shopify", "@/lib/commerce/shopify/*"],
  message: "lib/commerce/shopify is private to lib/commerce.",
};
const cms = {
  // Add your CMS packages here.
  group: [
    "@sanity/*",
    "next-sanity",
    "next-sanity/*",
    "sanity",
    "contentful",
    "@contentful/*",
    "@prismicio/*",
    "@storyblok/*",
  ],
  message: "Import from @/lib/content instead.",
};
const consent = {
  group: ["@c15t/*", "c15t"],
  message: "Import from @/lib/consent instead.",
};

const restrict = (patterns, paths = []) => ({
  "no-restricted-imports": ["error", { patterns, paths }],
});

const isServerModule = (source) => /\.server(\.[jt]sx?)?$/.test(source);

// Private folders, and the only folder whose files may import them. The
// @/ forms are covered by no-restricted-imports; this covers relative
// paths (../../lib/commerce/shopify/client.server).
const PRIVATE_DIRS = [
  { dir: "src/lib/commerce/shopify", from: "src/lib/commerce" },
];
const repoPath = (file) => relative(process.cwd(), file).split("\\").join("/");
const inside = (path, dir) => path === dir || path.startsWith(`${dir}/`);

// Small project rules for the server/client split.
const local = {
  rules: {
    // A "use client" file must not import *.server modules.
    "no-server-import-in-client": {
      meta: { type: "problem", schema: [] },
      create(context) {
        let isClient = false;
        const check = (node) => {
          if (isClient && node.source && isServerModule(node.source.value)) {
            context.report({
              node: node.source,
              message: "Client files can't import *.server modules.",
            });
          }
        };
        return {
          Program(program) {
            isClient = program.body.some(
              (statement) => statement.directive === "use client",
            );
          },
          ImportDeclaration: check,
          ExportNamedDeclaration: check,
          ExportAllDeclaration: check,
        };
      },
    },
    // Relative imports respect the same module boundaries as @/ imports.
    "no-relative-private-import": {
      meta: { type: "problem", schema: [] },
      create(context) {
        const from = repoPath(context.filename);
        const check = (node) => {
          const source = node.source?.value;
          if (typeof source !== "string" || !source.startsWith(".")) return;
          const target = repoPath(resolve(dirname(context.filename), source));
          for (const { dir, from: allowed } of PRIVATE_DIRS) {
            if (!inside(target, dir) || inside(from, allowed)) continue;
            context.report({
              node: node.source,
              message: `${dir} is private to ${allowed}.`,
            });
          }
        };
        return {
          ImportDeclaration: check,
          ExportNamedDeclaration: check,
          ExportAllDeclaration: check,
          ImportExpression: check,
        };
      },
    },
    // No "use cache" in Shopify operations: caching is decided one layer up
    // (catalog.server.ts), where the PublicContext rule applies.
    "no-use-cache": {
      meta: { type: "problem", schema: [] },
      create(context) {
        return {
          ExpressionStatement(node) {
            if (
              typeof node.directive === "string" &&
              node.directive.startsWith("use cache")
            ) {
              context.report({
                node,
                message:
                  'Cache in catalog.server.ts, not with "use cache" here.',
              });
            }
          },
        };
      },
    },
    // Every *.server module imports "server-only", so a client import fails
    // the build instead of shipping server code.
    "server-only-in-server-files": {
      meta: { type: "problem", schema: [] },
      create(context) {
        if (!isServerModule(context.filename)) return {};
        return {
          Program(program) {
            const hasGuard = program.body.some(
              (statement) =>
                statement.type === "ImportDeclaration" &&
                statement.source.value === "server-only",
            );
            if (!hasGuard) {
              context.report({
                node: program,
                message: 'Server modules must import "server-only".',
              });
            }
          },
        };
      },
    },
  },
};

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["src/**/*.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    plugins: { local },
    rules: {
      "local/no-server-import-in-client": "error",
      "local/server-only-in-server-files": "error",
      "local/no-relative-private-import": "error",
    },
  },
  {
    files: ["src/lib/commerce/shopify/**/*.{ts,tsx}"],
    plugins: { local },
    rules: { "local/no-use-cache": "error" },
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: [
      "src/lib/commerce/**",
      "src/lib/content/**",
      "src/lib/consent/**",
    ],
    rules: restrict([shopify, commerceInternals, cms, consent]),
  },
  {
    files: ["src/lib/commerce/**/*.{ts,tsx}"],
    ignores: ["src/lib/commerce/shopify/**"],
    rules: restrict([
      {
        ...shopify,
        message: "Only lib/commerce/shopify imports Shopify packages.",
      },
      cms,
      consent,
    ]),
  },
  {
    // Shopify operations stay uncached; caching is decided one layer up.
    files: ["src/lib/commerce/shopify/**/*.{ts,tsx}"],
    rules: restrict(
      [cms, consent],
      [
        {
          name: "next/cache",
          message: "Cache in catalog.server.ts, not in Shopify operations.",
        },
      ],
    ),
  },
  {
    files: ["src/lib/content/**/*.{ts,tsx}"],
    rules: restrict([shopify, commerceInternals, consent]),
  },
  {
    files: ["src/lib/consent/**/*.{ts,tsx}"],
    rules: restrict([shopify, commerceInternals, cms]),
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    // End-to-end test builds and reports.
    ".next-e2e/**",
    "test-results/**",
    "playwright-report/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Cloudflare builds (pnpm cf:build) and Wrangler's local state.
    ".open-next/**",
    ".wrangler/**",
  ]),
]);

export default eslintConfig;
