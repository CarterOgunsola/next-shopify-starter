import { ESLint } from "eslint";
import { describe, expect, it, vi } from "vitest";

// The project's own ESLint rules, through the real eslint.config.mjs.
const eslint = new ESLint();
const problems = async (filePath: string, code: string) =>
  (await eslint.lintText(code, { filePath }))[0].messages.map((m) => m.ruleId);

// Each case runs ESLint with the project's config, which can take more
// than the default 5 seconds while the rest of the suite runs alongside.
vi.setConfig({ testTimeout: 30_000 });

describe("module boundaries", () => {
  it("stop a relative import of Shopify internals from outside lib/commerce", async () => {
    expect(
      await problems(
        "src/components/shop/x.tsx",
        'export { storefrontRequest } from "../../lib/commerce/shopify/client.server";\n',
      ),
    ).toContain("local/no-relative-private-import");
  });

  it("allow it from inside lib/commerce", async () => {
    expect(
      await problems(
        "src/lib/commerce/x.server.ts",
        'import "server-only";\nexport { storefrontRequest } from "./shopify/client.server";\n',
      ),
    ).not.toContain("local/no-relative-private-import");
  });
});

describe('"use cache" in Shopify operations', () => {
  it("is refused", async () => {
    expect(
      await problems(
        "src/lib/commerce/shopify/operations/x.ts",
        'export async function read() {\n  "use cache";\n  return 1;\n}\n',
      ),
    ).toContain("local/no-use-cache");
  });

  it("is allowed in the catalog", async () => {
    expect(
      await problems(
        "src/lib/commerce/x.ts",
        'export async function read() {\n  "use cache";\n  return 1;\n}\n',
      ),
    ).not.toContain("local/no-use-cache");
  });
});
