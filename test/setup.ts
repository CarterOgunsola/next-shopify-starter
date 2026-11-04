import { afterAll, afterEach, beforeAll, vi } from "vitest";
import { server } from "@/lib/commerce/testing/msw";

// Tests run outside a request: connection() (request-time only) resolves.
vi.mock("next/server", async (original) => ({
  ...(await original<typeof import("next/server")>()),
  connection: async () => {},
}));

// next/font is a compiler transform, not a function, outside a Next build.
vi.mock("next/font/local", () => ({
  default: () => ({ className: "", variable: "", style: {} }),
}));

beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

// jsdom has no ResizeObserver; layout never changes there, so one that
// never calls back is faithful enough.
if (typeof window !== "undefined" && !globalThis.ResizeObserver) {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}
