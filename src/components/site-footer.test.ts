import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/commerce/menus.server", () => ({ siteMenu: vi.fn() }));
vi.mock("@/lib/env", () => ({ serverEnv: () => ({}) }));

const { withoutFooterCopies } = await import("./site-footer");

describe("withoutFooterCopies", () => {
  it("leaves out the legal links and policies the footer shows anyway, at every level", () => {
    const link = (title: string, url: string | null, items = []) => ({
      title,
      url,
      items,
    });
    expect(
      withoutFooterCopies([
        link("Search", "/search"),
        link("Privacy", "/privacy"),
        {
          title: "Help",
          url: null,
          items: [
            link("Refunds", "/policies/refund-policy"),
            link("Contact", "/pages/contact"),
          ],
        },
        // Nothing left under it: gone too.
        {
          title: "Legal",
          url: null,
          items: [
            link("Terms", "/terms"),
            link("Shipping", "/policies/shipping-policy"),
          ],
        },
      ]),
    ).toEqual([
      link("Search", "/search"),
      { title: "Help", url: null, items: [link("Contact", "/pages/contact")] },
    ]);
  });
});
