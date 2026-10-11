import { describe, expect, it } from "vitest";
import footer from "../../testing/fixtures/Menu.footer.json";
import main from "../../testing/fixtures/Menu.main-menu.json";
import nested from "../../testing/fixtures/Menu.synthetic-nested.json";
import type { MenuData } from "../operations/menu";
import { toMenu } from "./menu";

const HOSTS = ["synthetic-store.myshopify.com"];
// JSON widens Shopify's item types to string.
const items = (fixture: { data: { menu: { items: unknown } } }) =>
  fixture.data.menu.items as MenuData;

describe("toMenu", () => {
  it("points Shopify's default menus at this site's routes", () => {
    // Contact is a Shopify page this site has no route for: left out.
    expect(toMenu(items(main), HOSTS)).toEqual([
      { title: "Home", url: "/", items: [] },
      { title: "Catalog", url: "/shop", items: [] },
    ]);
    expect(toMenu(items(footer), HOSTS)).toEqual([
      { title: "Search", url: "/search", items: [] },
      { title: "Your Privacy Choices", url: "/privacy-choices", items: [] },
    ]);
  });

  it("keeps three levels, maps each item type and marks other sites", () => {
    expect(toMenu(items(nested), HOSTS)).toEqual([
      {
        title: "Shop",
        url: "/shop",
        items: [
          {
            title: "Apparel",
            url: "/collections/test-apparel",
            items: [
              {
                title: "Test Tee",
                url: "/products/test-tee-3-option",
                items: [],
              },
            ],
          },
          {
            title: "Electrolytes",
            url: "/products/test-electrolytes",
            items: [],
          },
        ],
      },
      {
        // A typed-in link on the store's domain, Markets prefix dropped.
        title: "Help",
        url: "/policies/refund-policy",
        items: [
          { title: "Refunds", url: "/policies/refund-policy", items: [] },
          {
            title: "Status",
            url: "https://status.example.com/",
            external: true,
            items: [],
          },
          // Blog: no route here.
        ],
      },
      { title: "Search", url: "/search", items: [] },
    ]);
  });

  it("refuses links that aren't http(s) and keeps headings with children", () => {
    const link = (url: string) => ({
      title: "x",
      type: "HTTP" as const,
      url,
      resource: null,
    });
    expect(
      toMenu([link("javascript:alert(1)"), link("not a url")], HOSTS),
    ).toEqual([]);
    expect(
      toMenu(
        [
          {
            ...link("javascript:void(0)"),
            title: "More",
            items: [link("https://synthetic-store.myshopify.com/search?q=a")],
          },
        ],
        HOSTS,
      ),
    ).toEqual([
      {
        title: "More",
        url: null,
        items: [{ title: "x", url: "/search?q=a", items: [] }],
      },
    ]);
  });

  it("keeps this site's own routes and never turns a link into another site's", () => {
    const link = (url: string) => ({
      title: "x",
      type: "HTTP" as const,
      url,
      resource: null,
    });
    const on = (path: string) =>
      toMenu([link(`https://synthetic-store.myshopify.com${path}`)], HOSTS)[0];
    expect(on("/fr-ca/collections/a")?.url).toBe("/collections/a");
    // Our Markdown routes aren't a locale.
    expect(on("/md/products/a")?.url).toBe("/md/products/a");
    // Not a locale shape: left alone.
    expect(on("/abc/x")?.url).toBe("/abc/x");
    // A path that would read as another host once its prefix is gone.
    for (const path of ["/en//evil.example/x", "/en/\\evil.example/x"]) {
      expect(on(path)).toMatchObject({ external: true });
      expect(on(path)?.url).toMatch(
        /^https:\/\/synthetic-store\.myshopify\.com\//,
      );
    }
  });
});
