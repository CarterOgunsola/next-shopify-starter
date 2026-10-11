import { describe, expect, it, vi } from "vitest";
import { handleMenusRevalidate } from "./menus-revalidate.server";

const SECRET = "s".repeat(40);
const post = (authorization?: string) =>
  new Request("https://local.test/api/revalidate/menus", {
    method: "POST",
    headers: authorization ? { authorization } : {},
  });

describe("POST /api/revalidate/menus", () => {
  it("refreshes every menu with the right token", async () => {
    const expire = vi.fn();
    const response = await handleMenusRevalidate(post(`Bearer ${SECRET}`), {
      secret: SECRET,
      expire,
    });
    expect(response.status).toBe(200);
    expect(expire).toHaveBeenCalledWith("menus");
  });

  it("refuses a wrong or missing token, and 404s until a secret is set", async () => {
    const expire = vi.fn();
    for (const auth of [undefined, "Bearer nope", `Bearer ${SECRET}x`]) {
      const response = await handleMenusRevalidate(post(auth), {
        secret: SECRET,
        expire,
      });
      expect(response.status).toBe(401);
    }
    expect(
      (
        await handleMenusRevalidate(post(`Bearer ${SECRET}`), {
          secret: null,
          expire,
        })
      ).status,
    ).toBe(404);
    expect(expire).not.toHaveBeenCalled();
  });
});
