// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { createRef } from "react";
import { afterEach, expect, it } from "vitest";
import { ShopifyImage } from "./shopify-image";

afterEach(cleanup);

it("hands its img to a ref, for code that measures or animates it", () => {
  const ref = createRef<HTMLImageElement>();
  render(
    <ShopifyImage
      ref={ref}
      src="https://cdn.shopify.com/s/files/1/0000/0001/files/tee.jpg"
      alt="Tee"
      width={400}
      height={400}
    />,
  );
  expect(ref.current).toBeInstanceOf(HTMLImageElement);
  expect(ref.current?.alt).toBe("Tee");
});
