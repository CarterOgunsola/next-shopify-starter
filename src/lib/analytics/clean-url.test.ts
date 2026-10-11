import { describe, expect, it } from "vitest";
import { cleanUrl } from "./clean-url";

describe("cleanUrl", () => {
  it("drops search terms, filters and anything else, keeps attribution", () => {
    expect(
      cleanUrl(
        "https://shop.test/search?q=hair+loss+avery%40example.test&filter.v.option.color=Navy&utm_source=email&dt_id=7&return_to=/x#frag",
      ),
    ).toBe("https://shop.test/search?utm_source=email&dt_id=7");
  });

  it("is the bare path without a query", () => {
    expect(cleanUrl("https://shop.test/products/tee?variant=1")).toBe(
      "https://shop.test/products/tee",
    );
  });

  it.each([
    "gad_source",
    "gad_campaignid",
    "dclid",
    "twclid",
    "li_fat_id",
    "epik",
    "ScCid",
    "_kx",
    "srsltid",
    "_gl",
    "UTM_Source",
    "GCLID",
  ])("keeps the %s click or campaign id", (param) => {
    expect(cleanUrl(`https://shop.test/p?${param}=1&q=x`)).toBe(
      `https://shop.test/p?${param}=1`,
    );
  });
});
