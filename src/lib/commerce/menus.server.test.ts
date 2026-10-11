import { HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";
import main from "./testing/fixtures/Menu.main-menu.json";
import { server, shopify } from "./testing/msw";
import { siteMenu } from "./menus.server";

const cache = vi.hoisted(() => ({ life: vi.fn(), tag: vi.fn() }));
vi.mock("next/cache", () => ({ cacheLife: cache.life, cacheTag: cache.tag }));
const on = { shopEnabled: () => true };

describe("siteMenu", () => {
  it("reads the Shopify menu, cached with the menus tag for an hour", async () => {
    server.use(
      shopify.query("Menu", ({ variables }) =>
        variables.handle === "main-menu"
          ? HttpResponse.json(main)
          : HttpResponse.json({ data: { ...main.data, menu: null } }),
      ),
    );
    cache.life.mockClear();
    expect((await siteMenu("header", on)).map((i) => i.url)).toEqual([
      "/",
      "/shop",
    ]);
    expect(cache.tag).toHaveBeenCalledWith("menus", "menu-main-menu");
    expect(cache.life).toHaveBeenCalledWith("hours");
  });

  it("falls back to its own links when the menu is missing or Shopify is down", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    server.use(
      shopify.query("Menu", () =>
        HttpResponse.json({ data: { ...main.data, menu: null } }),
      ),
    );
    expect(await siteMenu("header", on)).toEqual([
      { title: "Shop", url: "/shop", items: [] },
    ]);
    server.use(
      shopify.query("Menu", () => new HttpResponse(null, { status: 503 })),
    );
    cache.life.mockClear();
    expect((await siteMenu("footer", on)).map((i) => i.url)).toEqual([
      "/shop",
      "/search",
    ]);
    // A failure isn't kept for long.
    expect(cache.life).toHaveBeenCalledWith("minutes");
  });

  it("has no shop menus while the shop is off", async () => {
    expect(await siteMenu("header", { shopEnabled: () => false })).toEqual([]);
  });
});
