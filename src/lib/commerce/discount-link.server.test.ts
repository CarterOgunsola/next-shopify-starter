import { describe, expect, it, vi } from "vitest";
import { handleDiscountLink } from "./discount-link.server";

const applyDiscountCode = vi.hoisted(() => vi.fn(async () => ({ ok: true })));
vi.mock("./discount.server", () => ({ applyDiscountCode }));
vi.mock("./buyer.server", () => ({
  getBuyerContext: async () => ({ audience: "consumer" }),
}));

const on = { shopEnabled: () => true };
const link = (query = "") =>
  new Request(`http://localhost/discount/TEST10${query}`);

describe("handleDiscountLink", () => {
  it("applies the code and redirects to the requested page", async () => {
    const response = await handleDiscountLink(
      link("?redirect=/products/test-tee-3-option"),
      "TEST10",
      on,
    );
    expect(applyDiscountCode).toHaveBeenCalledWith("TEST10", {
      audience: "consumer",
    });
    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe(
      "/products/test-tee-3-option",
    );
    expect(response.headers.get("X-Robots-Tag")).toBe("noindex");
  });

  it("carries Collabs and campaign params to the landing page", async () => {
    const response = await handleDiscountLink(
      link("?redirect=/products/test-tee-3-option&dt_id=0&utm_source=collabs"),
      "TEST10",
      on,
    );
    expect(response.headers.get("Location")).toBe(
      "/products/test-tee-3-option?dt_id=0&utm_source=collabs",
    );
  });

  it("never redirects off the site", async () => {
    const response = await handleDiscountLink(
      link("?redirect=//evil.test/x"),
      "TEST10",
      on,
    );
    expect(response.headers.get("Location")).toBe("/");
  });

  it("still redirects when Shopify fails, logging only the error class", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    applyDiscountCode.mockRejectedValueOnce(
      Object.assign(new Error("401 for synthetic-secret"), {
        name: "ShopifyRequestError",
      }),
    );
    const response = await handleDiscountLink(
      link("?redirect=/cart"),
      "TEST10",
      on,
    );
    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("/cart");
    expect(JSON.stringify(warn.mock.calls)).toContain("ShopifyRequestError");
    expect(JSON.stringify(warn.mock.calls)).not.toContain("synthetic-secret");
    warn.mockRestore();
  });

  it("404s while the shop is off", async () => {
    applyDiscountCode.mockClear();
    const response = await handleDiscountLink(link(), "TEST10", {
      shopEnabled: () => false,
    });
    expect(response.status).toBe(404);
    expect(applyDiscountCode).not.toHaveBeenCalled();
  });
});
