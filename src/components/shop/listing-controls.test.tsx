// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Facet } from "@/lib/commerce";
import { ListingControls } from "./listing-controls";

afterEach(cleanup);

const price: Facet = {
  id: "filter.v.price",
  label: "Price",
  type: "price",
  values: [],
};

function renderControls(currency: string | null) {
  const onChange = vi.fn();
  render(
    <ListingControls
      action="/collections/apparel"
      facets={[price]}
      sorts={[]}
      params={new URLSearchParams()}
      currency={currency}
      onChange={onChange}
    />,
  );
  return onChange;
}

describe("the price filter", () => {
  it("labels prices in the shop's currency", () => {
    renderControls("CAD");
    expect(screen.getByLabelText("From CA$")).toBeTruthy();
    expect(screen.getByLabelText("To CA$")).toBeTruthy();
  });

  it("leaves the symbol out when the currency isn't known", () => {
    renderControls(null);
    expect(screen.getByLabelText("From")).toBeTruthy();
  });

  it("applies once typing stops, without waiting for blur", async () => {
    const onChange = renderControls("USD");
    await userEvent.type(screen.getByLabelText("From $"), "10");
    expect(onChange).not.toHaveBeenCalled();
    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1), {
      timeout: 1_000,
    });
    const next = onChange.mock.calls[0][0] as URLSearchParams;
    expect(next.get("filter.v.price.gte")).toBe("10");
  });

  it("applies at once on Enter", async () => {
    const onChange = renderControls("USD");
    await userEvent.type(screen.getByLabelText("To $"), "25{Enter}");
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(
      (onChange.mock.calls[0][0] as URLSearchParams).get("filter.v.price.lte"),
    ).toBe("25");
    // And not again when the delay would have run out.
    await new Promise((resolve) => setTimeout(resolve, 450));
    expect(onChange).toHaveBeenCalledTimes(1);
  });
});
