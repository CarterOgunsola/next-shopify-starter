"use client";

import type { Facet } from "@/lib/commerce";
import {
  clearFilters,
  isFilterActive,
  priceRange,
  toSearch,
  toggleFilter,
  withPriceRange,
} from "@/lib/commerce/browse-url";

// The filters in use, each removable, plus "clear all". Plain links, so
// they work without JavaScript.
export function ActiveFilters({
  pathname,
  facets,
  params,
  onChange,
}: {
  pathname: string;
  facets: Facet[];
  params: URLSearchParams;
  onChange: (next: URLSearchParams) => void;
}) {
  const chips = facets.flatMap((facet) =>
    facet.type === "price"
      ? []
      : facet.values
          .filter((value) => isFilterActive(params, value.input))
          .map((value) => ({
            label: `${facet.label}: ${value.label}`,
            next: toggleFilter(params, value.input, false),
          })),
  );
  const price = priceRange(params);
  if (price.min || price.max) {
    chips.push({
      label: `Price: ${price.min || "0"} to ${price.max || "any"}`,
      next: withPriceRange(params, { min: "", max: "" }),
    });
  }
  if (chips.length === 0) return null;

  const link = (next: URLSearchParams, label: string, text: string) => (
    <a
      href={`${pathname}${toSearch(next)}`}
      aria-label={label}
      onClick={(event) => {
        event.preventDefault();
        onChange(next);
      }}
    >
      {text}
    </a>
  );

  return (
    <ul aria-label="Active filters">
      {chips.map((chip) => (
        <li key={chip.label}>
          {chip.label}{" "}
          {link(chip.next, `Remove filter ${chip.label}`, "Remove")}
        </li>
      ))}
      <li>{link(clearFilters(params), "Clear all filters", "Clear all")}</li>
    </ul>
  );
}
