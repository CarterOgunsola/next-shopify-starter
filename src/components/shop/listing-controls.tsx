"use client";

import { useId, useRef, useState, useEffect } from "react";
import type { Facet } from "@/lib/commerce";
import {
  filterField,
  isFilterActive,
  priceRange,
  sortValue,
  toggleFilter,
  withPriceRange,
  withSort,
  type SortOption,
} from "@/lib/commerce/browse-url";

// Filters and sort as a real GET form, so they work without JavaScript;
// with it, each change updates the URL in place.
export function ListingControls({
  action,
  facets,
  sorts,
  params,
  hidden = {},
  currency = null,
  onChange,
}: {
  // The shop currency (ISO code), for the price filter's labels.
  currency?: string | null;
  action: string;
  facets: Facet[];
  sorts: SortOption[];
  params: URLSearchParams;
  // Extra params the form must carry (the search term).
  hidden?: Record<string, string>;
  onChange: (next: URLSearchParams) => void;
}) {
  const id = useId();
  const currentSort = params.get("sort_by") ?? "";
  // Arrowing through the sort options (which fires change on each one in
  // some browsers) only picks; Enter or leaving the field applies. A
  // choice made with the pointer applies at once.
  const [sortDraft, setSortDraft] = useState<string | null>(null);
  const arrowing = useRef(false);
  const applySort = (value: string) => {
    setSortDraft(null);
    if (value !== currentSort) onChange(withSort(params, value));
  };

  return (
    <form method="get" action={action} aria-label="Filter and sort">
      {Object.entries(hidden).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <label htmlFor={`${id}-sort`}>Sort by</label>{" "}
      <select
        id={`${id}-sort`}
        name="sort_by"
        value={sortDraft ?? currentSort}
        onPointerDown={() => {
          arrowing.current = false;
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            if (sortDraft !== null) applySort(sortDraft);
          } else if (/^(Arrow|Page|Home|End)/.test(event.key)) {
            arrowing.current = true;
          }
        }}
        onChange={(event) =>
          arrowing.current
            ? setSortDraft(event.target.value)
            : applySort(event.target.value)
        }
        onBlur={() => {
          arrowing.current = false;
          if (sortDraft !== null) applySort(sortDraft);
        }}
      >
        {sorts.map((option, index) => {
          const value = index === 0 ? "" : sortValue(option);
          return (
            <option key={value || "default"} value={value}>
              {option.label}
            </option>
          );
        })}
      </select>
      {facets.map((facet) =>
        facet.type === "price" ? (
          <PriceFilter
            key={facet.id}
            facet={facet}
            params={params}
            currency={currency}
            onChange={onChange}
          />
        ) : (
          <fieldset key={facet.id}>
            <legend>{facet.label}</legend>
            {facet.values.map((value) => {
              const field = filterField(value.input);
              if (!field) return null;
              const active = isFilterActive(params, value.input);
              return (
                <label key={value.id}>
                  <input
                    type="checkbox"
                    name={field.name}
                    value={field.value}
                    checked={active}
                    disabled={value.count === 0 && !active}
                    onChange={(event) =>
                      onChange(
                        toggleFilter(params, value.input, event.target.checked),
                      )
                    }
                  />
                  {value.label} ({value.count})
                </label>
              );
            })}
          </fieldset>
        ),
      )}
      <noscript>
        <button type="submit">Apply</button>
      </noscript>
    </form>
  );
}

// Applies 350ms after typing stops, or at once on blur or Enter.
export const PRICE_FILTER_DELAY_MS = 350;

// "$" for USD, "CA$" for CAD: the shop currency's symbol, if known.
function currencySymbol(currency: string | null): string | null {
  if (!currency) return null;
  try {
    return (
      new Intl.NumberFormat("en-US", { style: "currency", currency })
        .formatToParts(0)
        .find((part) => part.type === "currency")?.value ?? null
    );
  } catch {
    return null;
  }
}

function PriceFilter({
  facet,
  params,
  currency,
  onChange,
}: {
  facet: Facet;
  params: URLSearchParams;
  currency: string | null;
  onChange: (next: URLSearchParams) => void;
}) {
  const id = useId();
  const current = priceRange(params);
  const [draft, setDraft] = useState<{ min: string; max: string } | null>(null);
  const value = draft ?? current;
  const commit = () => {
    if (!draft) return;
    setDraft(null);
    if (draft.min !== current.min || draft.max !== current.max) {
      onChange(withPriceRange(params, draft));
    }
  };
  // Typing settles: apply without waiting for blur.
  useEffect(() => {
    if (!draft) return;
    const timer = setTimeout(() => {
      setDraft(null);
      if (draft.min !== current.min || draft.max !== current.max) {
        onChange(withPriceRange(params, draft));
      }
    }, PRICE_FILTER_DELAY_MS);
    return () => clearTimeout(timer);
  }, [draft, current.min, current.max, params, onChange]);
  const symbol = currencySymbol(currency);
  const field = (key: "min" | "max", name: string, label: string) => (
    <>
      <label htmlFor={`${id}-${key}`}>{label}</label>{" "}
      <input
        id={`${id}-${key}`}
        type="number"
        inputMode="decimal"
        min={0}
        step="0.01"
        name={name}
        value={value[key]}
        onChange={(event) => setDraft({ ...value, [key]: event.target.value })}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            commit();
          }
        }}
      />{" "}
    </>
  );
  return (
    <fieldset>
      <legend>{facet.label}</legend>
      {field("min", "filter.v.price.gte", symbol ? `From ${symbol}` : "From")}
      {field("max", "filter.v.price.lte", symbol ? `To ${symbol}` : "To")}
    </fieldset>
  );
}
