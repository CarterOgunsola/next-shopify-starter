import { describe, expect, it, vi } from "vitest";
import { BRAND } from "@/lib/brand";
import { handleSignup, type SignupDeps } from "./newsletter";
import { HONEYPOT_FIELD } from "./newsletter-shared";

const EMAIL = "test.subscriber@example.com";

function form(fields: Record<string, string>) {
  const data = new FormData();
  for (const [k, v] of Object.entries(fields)) data.set(k, v);
  return data;
}

function deps(overrides: Partial<SignupDeps> = {}) {
  const subscribe = vi.fn(async () => ({ ok: true as const }));
  const log = vi.fn();
  return {
    subscribe,
    log,
    deps: {
      apiKey: "pk_synthetic",
      listId: "List01",
      allow: () => true,
      clientKey: "test",
      subscribe,
      log,
      ...overrides,
    } satisfies SignupDeps,
  };
}

describe("handleSignup", () => {
  it("subscribes a valid email to the configured list", async () => {
    const { subscribe, deps: d } = deps();
    const state = await handleSignup(
      form({ email: ` ${EMAIL} `, source: "footer" }),
      d,
    );
    expect(state).toEqual({ status: "success" });
    expect(subscribe).toHaveBeenCalledWith({
      apiKey: "pk_synthetic",
      listId: "List01",
      email: EMAIL,
      source: `${BRAND.sourcePrefix} footer`,
    });
  });

  it("rejects an invalid email without calling Klaviyo", async () => {
    const { subscribe, deps: d } = deps();
    const state = await handleSignup(form({ email: "nope" }), d);
    expect(state.status).toBe("error");
    expect(subscribe).not.toHaveBeenCalled();
  });

  it("quietly drops honeypot submissions", async () => {
    const { subscribe, deps: d } = deps();
    const state = await handleSignup(
      form({ email: EMAIL, [HONEYPOT_FIELD]: "http://spam.example" }),
      d,
    );
    expect(state).toEqual({ status: "success" });
    expect(subscribe).not.toHaveBeenCalled();
  });

  it("stops rate-limited clients", async () => {
    const { subscribe, deps: d } = deps({ allow: () => false });
    const state = await handleSignup(form({ email: EMAIL }), d);
    expect(state.status).toBe("error");
    expect(subscribe).not.toHaveBeenCalled();
  });

  it("is a no-op when the key or list is missing", async () => {
    for (const missing of [{ apiKey: undefined }, { listId: undefined }]) {
      const { subscribe, deps: d } = deps(missing);
      const state = await handleSignup(form({ email: EMAIL }), d);
      expect(state.status).toBe("error");
      expect(subscribe).not.toHaveBeenCalled();
    }
  });

  it("reports Klaviyo failures without logging the email", async () => {
    const { log, deps: d } = deps({
      subscribe: vi.fn(async () => ({ ok: false as const, status: 400 })),
    });
    const state = await handleSignup(form({ email: EMAIL }), d);
    expect(state.status).toBe("error");
    expect(log).toHaveBeenCalled();
    expect(JSON.stringify(log.mock.calls)).not.toContain(EMAIL);
  });

  it("handles network errors and timeouts", async () => {
    const { deps: d, log } = deps({
      subscribe: vi.fn(async () => {
        throw new DOMException("timed out", "TimeoutError");
      }),
    });
    const state = await handleSignup(form({ email: EMAIL }), d);
    expect(state.status).toBe("error");
    expect(JSON.stringify(log.mock.calls)).toContain("TimeoutError");
  });
});
