// End-to-end test mode (E2E=1, set by e2e/support/serve.mjs): a build of
// its own with Next's test proxy on, which lets a request's headers route
// the server's outgoing fetches. That must never run with a real store's
// private token or on a deployment, so it refuses unless the store is the
// tests' synthetic one and the build isn't on Vercel.
export const E2E_STORE_DOMAIN = "synthetic-store.myshopify.com";

export function e2eMode(env: Record<string, string | undefined>): boolean {
  if (env.E2E !== "1") return false;
  if (env.VERCEL || env.VERCEL_ENV) {
    throw new Error("E2E=1 is for local and CI test runs, never a deployment.");
  }
  if (env.SHOPIFY_STORE_DOMAIN !== E2E_STORE_DOMAIN) {
    throw new Error(
      `E2E=1 needs SHOPIFY_STORE_DOMAIN=${E2E_STORE_DOMAIN} (run pnpm test:e2e).`,
    );
  }
  return true;
}

// NEXT_PRIVATE_TEST_PROXY turns on Next's test interception wherever it's
// set, with or without the config: refused outside end-to-end test mode.
export function refuseStrayTestProxy(
  env: Record<string, string | undefined>,
): void {
  if (env.NEXT_PRIVATE_TEST_PROXY && !e2eMode(env)) {
    throw new Error(
      "NEXT_PRIVATE_TEST_PROXY is set outside end-to-end test mode.",
    );
  }
}
