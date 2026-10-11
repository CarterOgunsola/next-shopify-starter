import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "server-only": fileURLToPath(
        new URL("./test/server-only.ts", import.meta.url),
      ),
    },
  },
  test: {
    include: ["src/**/*.test.{ts,tsx}"],
    // Live tests hit the dev store; run them with pnpm test:live.
    exclude: ["src/**/*.live.test.ts", "node_modules/**"],
    environment: "node",
    // Tests never touch the network: MSW fails any request without a
    // handler, and Shopify env points at a synthetic store.
    setupFiles: ["./test/setup.ts"],
    env: {
      SHOPIFY_STORE_DOMAIN: "synthetic-store.myshopify.com",
      SHOPIFY_PRIVATE_ACCESS_TOKEN: "synthetic-private-token",
    },
  },
});
