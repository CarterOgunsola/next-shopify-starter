import { describe, expect, it } from "vitest";
import { shopifyImageLoader } from "./image";

describe("shopifyImageLoader", () => {
  it("asks Shopify's CDN for the width and keeps the version param", () => {
    expect(
      shopifyImageLoader({
        src: "https://cdn.shopify.com/s/files/1/0001/files/Main.jpg?v=179",
        width: 640,
      }),
    ).toBe(
      "https://cdn.shopify.com/s/files/1/0001/files/Main.jpg?v=179&width=640",
    );
  });

  it("leaves other hosts alone", () => {
    expect(
      shopifyImageLoader({ src: "https://example.test/a.jpg", width: 640 }),
    ).toBe("https://example.test/a.jpg");
  });
});
