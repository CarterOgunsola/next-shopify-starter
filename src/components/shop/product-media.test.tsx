// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { productContent } from "@/lib/commerce/testing/factories";
import { ProductMedia } from "./product-media";

afterEach(cleanup);

describe("ProductMedia", () => {
  it("fetches the lead image first and eagerly, the rest lazily", () => {
    const { media } = productContent("tee");
    render(<ProductMedia media={media} />);
    const [lead, ...rest] = screen.getAllByRole("img");
    expect(lead.getAttribute("fetchpriority")).toBe("high");
    expect(lead.getAttribute("loading")).toBe("eager");
    for (const image of rest) {
      expect(image.getAttribute("loading")).toBe("lazy");
      expect(image.getAttribute("fetchpriority")).toBeNull();
    }
  });
});
