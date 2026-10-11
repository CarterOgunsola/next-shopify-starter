import { afterAll, afterEach, beforeAll, vi } from "vitest";
import { server } from "@/lib/commerce/testing/msw";

// Tests run outside a request: connection() (request-time only) resolves.
vi.mock("next/server", async (original) => ({
  ...(await original<typeof import("next/server")>()),
  connection: async () => {},
}));

beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
