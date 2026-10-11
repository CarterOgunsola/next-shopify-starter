import { afterEach, describe, expect, it, vi } from "vitest";
import { subscribeToNewsletter } from "./actions";

const mocks = vi.hoisted(() => ({
  headers: new Headers(),
  handleSignup: vi.fn(async () => ({ status: "success" as const })),
}));

vi.mock("next/headers", () => ({ headers: async () => mocks.headers }));
vi.mock("./newsletter", () => ({ handleSignup: mocks.handleSignup }));

const form = () => {
  const data = new FormData();
  data.set("email", "test.subscriber@example.com");
  return data;
};

afterEach(() => {
  vi.unstubAllEnvs();
  mocks.handleSignup.mockClear();
  mocks.headers = new Headers();
});

describe("subscribeToNewsletter", () => {
  it("rate limits by the visitor's IP", async () => {
    mocks.headers = new Headers({ "x-real-ip": "203.0.113.7" });
    await subscribeToNewsletter({ status: "idle" }, form());
    expect(mocks.handleSignup).toHaveBeenCalledWith(
      expect.any(FormData),
      expect.objectContaining({ clientKey: "203.0.113.7" }),
    );
  });

  it("refuses in production when the IP is unknown", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const state = await subscribeToNewsletter({ status: "idle" }, form());
    expect(state.status).toBe("error");
    expect(mocks.handleSignup).not.toHaveBeenCalled();
  });
});
