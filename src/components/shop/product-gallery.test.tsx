// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { productContent } from "@/lib/commerce/testing/factories";
import { ProductGallery } from "./product-gallery";

const nav = vi.hoisted(() => ({ search: "" }));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(nav.search),
}));

afterEach(cleanup);

describe("ProductGallery", () => {
  it("leads with the selected variant's image", () => {
    const tee = productContent("tee");
    const navy = tee.variantImages.find(
      (image) => image.options.Color === "Navy",
    )!;

    nav.search = "";
    const { rerender } = render(<ProductGallery product={tee} />);
    const first = () => screen.getAllByRole("img")[0].getAttribute("src") ?? "";
    const defaultLead = first();

    nav.search = "color=navy";
    rerender(<ProductGallery product={tee} />);

    expect(new URL(first()).pathname).toBe(new URL(navy.url).pathname);
    expect(first()).not.toBe(defaultLead);
  });
});
