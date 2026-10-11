import { describe, expect, it } from "vitest";
import {
  MAX_FILTER_VALUE,
  MAX_FILTERS,
  parseBrowseParams,
} from "./browse-params";

describe("parseBrowseParams", () => {
  it("caps the number of filters", () => {
    const params = new URLSearchParams(
      Array.from({ length: MAX_FILTERS + 10 }, (_, i) => [
        "filter.v.option.Color",
        `c${i}`,
      ]),
    );
    expect(parseBrowseParams(params).filters).toHaveLength(MAX_FILTERS);
  });

  it("drops filter values that are too long", () => {
    const params = new URLSearchParams([
      ["filter.v.option.Color", "x".repeat(MAX_FILTER_VALUE + 1)],
      ["filter.v.option.Color", "Navy"],
    ]);
    expect(parseBrowseParams(params).filters).toHaveLength(1);
  });
});
