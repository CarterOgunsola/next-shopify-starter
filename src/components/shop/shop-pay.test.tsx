// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ShopPayBuyNow } from "./shop-pay-buy-now";

afterEach(cleanup);

describe("ShopPayBuyNow", () => {
  it("posts the variant and quantity to /cart/buy-now as a plain form", () => {
    const { container } = render(
      <ShopPayBuyNow variantId="gid://shopify/ProductVariant/1" quantity={2} />,
    );
    const form = container.querySelector("form")!;
    expect(form.getAttribute("method")).toBe("post");
    expect(form.getAttribute("action")).toBe("/cart/buy-now");
    expect(Object.fromEntries(new FormData(form))).toEqual({
      variantId: "gid://shopify/ProductVariant/1",
      quantity: "2",
    });
  });

  it("sends one checkout per click", () => {
    const { container } = render(
      <ShopPayBuyNow variantId="gid://shopify/ProductVariant/1" quantity={1} />,
    );
    const form = container.querySelector("form")!;
    // fireEvent says whether the event went ahead (not prevented).
    expect(fireEvent.submit(form)).toBe(true);
    expect(fireEvent.submit(form)).toBe(false);
  });

  it("is ready again after coming back from the browser's cache", () => {
    const { container } = render(
      <ShopPayBuyNow variantId="gid://shopify/ProductVariant/1" quantity={1} />,
    );
    fireEvent.submit(container.querySelector("form")!);
    expect(screen.getByRole("button").textContent).toBe("Opening Shop Pay…");
    fireEvent(window, new PageTransitionEvent("pageshow", { persisted: true }));
    expect(screen.getByRole("button").textContent).toBe("Buy with Shop Pay");
  });
});
