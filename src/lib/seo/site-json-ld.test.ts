import { describe, expect, it } from "vitest";
import { siteJsonLd } from "./site-json-ld";

describe("siteJsonLd", () => {
  it("adds the search action only with the shop on", () => {
    const [organization, website] = siteJsonLd("https://example.test", {
      search: true,
    });
    expect(organization["@type"]).toBe("Organization");
    expect(website).toMatchObject({
      "@type": "WebSite",
      potentialAction: {
        target: {
          urlTemplate: "https://example.test/search?q={search_term_string}",
        },
      },
    });
    expect(
      siteJsonLd("https://example.test", { search: false })[1],
    ).not.toHaveProperty("potentialAction");
  });
});
