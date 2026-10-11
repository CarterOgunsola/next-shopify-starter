import { describe, expect, it, vi } from "vitest";
import { writableSessionManager } from "./customer-session.server";
import { CUSTOMER_COOKIE, openSession, sealSession } from "./session-cookie";

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined }),
}));

const SECRET = "synthetic-session-secret-0123456789abcdef";

describe("writableSessionManager", () => {
  it("reads the session from the request and commits only when it changes", async () => {
    const cookie = `${CUSTOMER_COOKIE}=${sealSession({ state: "s1" }, SECRET)}`;
    const manager = writableSessionManager(
      new Request("https://local.test/account/refresh", {
        headers: { cookie },
      }),
      SECRET,
    );
    expect(await manager.getSessionItem("state")).toBe("s1");
    expect(await manager.commit?.()).toBeUndefined();

    await manager.setSessionItem("verifier", "v1");
    await manager.removeSessionItem("state");
    const headers = (await manager.commit?.()) as Headers;
    const [first] = headers.getSetCookie();
    const sealed = first.split(";")[0].split("=").slice(1).join("=");
    expect(headers.getSetCookie()).toHaveLength(4);
    expect(openSession(sealed, SECRET)).toEqual({ verifier: "v1" });
    expect(await manager.getSessionOrigin()).toBe("https://local.test");
  });
});

describe("getShopId", () => {
  it("tries again after a failed lookup and rejects an empty id", async () => {
    vi.resetModules();
    const fetchShopId = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error("timeout"))
      .mockResolvedValueOnce("")
      .mockResolvedValueOnce("gid://shopify/Shop/5550000001");
    vi.doMock("./operations/shop", () => ({ fetchShopId }));
    const { getShopId, SHOP_ID_RETRY_MS } =
      await import("./customer-session.server");
    // Each retry after the failure window.
    const later = (n: number) => Date.now() + n * (SHOP_ID_RETRY_MS + 1);
    await expect(getShopId()).rejects.toThrow("timeout");
    await expect(getShopId(later(1))).rejects.toThrow("no shop id");
    await expect(getShopId(later(2))).resolves.toBe("5550000001");
    await expect(getShopId(later(3))).resolves.toBe("5550000001");
    expect(fetchShopId).toHaveBeenCalledTimes(3);
    vi.doUnmock("./operations/shop");
  });
});

describe("getShopId after a failure", () => {
  it("fails fast for a while instead of waiting on Shopify again", async () => {
    vi.resetModules();
    const fetchShopId = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error("outage"))
      .mockResolvedValue("gid://shopify/Shop/7");
    vi.doMock("./operations/shop", () => ({ fetchShopId }));
    const { getShopId, SHOP_ID_RETRY_MS } =
      await import("./customer-session.server");
    await expect(getShopId()).rejects.toThrow("outage");
    await expect(getShopId()).rejects.toThrow("failed recently");
    expect(fetchShopId).toHaveBeenCalledTimes(1);
    await expect(getShopId(Date.now() + SHOP_ID_RETRY_MS + 1)).resolves.toBe(
      "7",
    );
    vi.doUnmock("./operations/shop");
  });

  it("gives up on a slow lookup", async () => {
    vi.resetModules();
    vi.useFakeTimers();
    vi.doMock("./operations/shop", () => ({
      fetchShopId: () => new Promise<string>(() => {}),
    }));
    const { getShopId, SHOP_ID_TIMEOUT_MS } =
      await import("./customer-session.server");
    const pending = getShopId();
    vi.advanceTimersByTime(SHOP_ID_TIMEOUT_MS + 1);
    await expect(pending).rejects.toThrow("timed out");
    vi.useRealTimers();
    vi.doUnmock("./operations/shop");
  });
});
