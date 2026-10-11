import { describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  value: { status: "needs-refresh" } as { status: string },
}));
vi.mock("./customer.server", () => ({
  getAccountState: async () => state.value,
}));
const redirect = vi.hoisted(() =>
  vi.fn(() => {
    throw new Error("NEXT_REDIRECT");
  }),
);
vi.mock("next/navigation", () => ({ redirect }));

const { loadAccount } = await import("./account-route.server");

describe("loadAccount", () => {
  it("sends an expired session through /account/refresh once, relinking the cart", async () => {
    await expect(loadAccount("/account/orders", false)).rejects.toThrow(
      "NEXT_REDIRECT",
    );
    const linkCart = `/account/link-cart?return_to=${encodeURIComponent("/account/orders?refreshed=1")}`;
    expect(redirect).toHaveBeenCalledWith(
      `/account/refresh?return_to=${encodeURIComponent(linkCart)}`,
    );
  });

  it("offers a retry, not a sign-out, when the refresh failed for a passing reason", async () => {
    expect(await loadAccount("/account", true)).toEqual({ status: "error" });
  });

  it("passes other states through", async () => {
    state.value = { status: "unavailable" };
    expect(await loadAccount("/account", false)).toEqual({
      status: "unavailable",
    });
  });
});
