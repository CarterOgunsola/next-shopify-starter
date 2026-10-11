"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useState } from "react";
import {
  recentlyViewed,
  watchRecentlyViewedConsent,
} from "@/lib/commerce/recently-viewed";
import { withSearchTracking } from "@/lib/commerce/search-tracking";
import { formatMoney, type ProductCard } from "@/lib/commerce";
import { usePredictiveSearch } from "@/lib/commerce/use-predictive-search";

type Option = { id: string; href: string; label: string; group: string };

// Header search with suggestions, following the ARIA combobox pattern:
// arrows move through the options, Enter opens the active one (or searches
// for the term), Escape closes. Without JavaScript it's a GET form. Empty,
// it suggests the visitor's recently viewed products (with preferences
// consent), as current cards.
export function SearchBox() {
  const router = useRouter();
  const id = useId();
  const [term, setTerm] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const { results, loading } = usePredictiveSearch(term);
  const [recent, setRecent] = useState<ProductCard[]>([]);
  const empty = term.trim() === "";

  // On every page (the header): clears the list if consent is withdrawn.
  useEffect(() => watchRecentlyViewedConsent(), []);

  const loadRecent = async () => {
    const handles = await recentlyViewed();
    if (handles.length === 0) return setRecent([]);
    // One card a request: each URL is shared-cached for everyone, and no
    // cache key records which products one visitor looked at.
    const cards = await Promise.all(
      handles.map(async (handle) => {
        const response = await fetch(
          `/api/commerce/cards?handles=${encodeURIComponent(handle)}`,
        ).catch(() => null);
        const body = response?.ok
          ? ((await response.json()) as { products: ProductCard[] })
          : null;
        return body?.products ?? [];
      }),
    );
    setRecent(cards.flat());
  };

  const options = useMemo<Option[]>(
    () =>
      empty
        ? recent.map((product) => ({
            id: `${id}-r-${product.handle}`,
            href: `/products/${product.handle}`,
            label: `${product.title}, ${formatMoney(product.price.min)}`,
            group: "Recently viewed",
          }))
        : [
            ...results.queries.map((query, i) => ({
              id: `${id}-q${i}`,
              href: withSearchTracking(
                `/search?q=${encodeURIComponent(query.text)}`,
                query.trackingParameters,
              ),
              label: query.text,
              group: "Suggestions",
            })),
            ...results.products.map((product) => ({
              id: `${id}-p-${product.handle}`,
              href: withSearchTracking(
                `/products/${product.handle}`,
                product.trackingParameters,
              ),
              label: `${product.title}, ${formatMoney(product.price.min)}`,
              group: "Products",
            })),
            ...results.collections.map((collection) => ({
              id: `${id}-c-${collection.handle}`,
              href: withSearchTracking(
                `/collections/${collection.handle}`,
                collection.trackingParameters,
              ),
              label: collection.title,
              group: "Collections",
            })),
          ],
    [empty, recent, results, id],
  );
  const expanded = open && options.length > 0;
  const groups = [...new Set(options.map((o) => o.group))];

  const go = (href: string) => {
    setOpen(false);
    setActive(-1);
    router.push(href);
  };

  return (
    <form
      method="get"
      action="/search"
      role="search"
      onSubmit={(event) => {
        event.preventDefault();
        if (expanded && active >= 0) go(options[active].href);
        else if (term.trim())
          go(`/search?q=${encodeURIComponent(term.trim())}`);
      }}
    >
      <label htmlFor={`${id}-input`}>Search</label>{" "}
      <input
        id={`${id}-input`}
        type="search"
        name="q"
        autoComplete="off"
        role="combobox"
        aria-expanded={expanded}
        aria-controls={`${id}-listbox`}
        aria-autocomplete="list"
        aria-activedescendant={
          expanded && active >= 0 ? options[active].id : undefined
        }
        value={term}
        onChange={(event) => {
          setTerm(event.target.value);
          setOpen(true);
          setActive(-1);
        }}
        onFocus={() => {
          setOpen(true);
          if (empty) void loadRecent();
        }}
        onBlur={() => setOpen(false)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" && options.length) {
            event.preventDefault();
            setOpen(true);
            setActive((i) => (i + 1) % options.length);
          } else if (event.key === "ArrowUp" && options.length) {
            event.preventDefault();
            setActive((i) => (i <= 0 ? options.length - 1 : i - 1));
          } else if (event.key === "Escape") {
            setOpen(false);
            setActive(-1);
          }
        }}
      />{" "}
      <button type="submit">Search</button>
      <div
        id={`${id}-listbox`}
        role="listbox"
        aria-label="Search suggestions"
        hidden={!expanded}
      >
        {groups.map((group) => (
          <div key={group} role="group" aria-label={group}>
            {options
              .filter((option) => option.group === group)
              .map((option) => {
                const index = options.indexOf(option);
                return (
                  <div
                    key={option.id}
                    id={option.id}
                    role="option"
                    aria-selected={index === active}
                    // Keep focus in the input when choosing with a pointer.
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => go(option.href)}
                  >
                    {option.label}
                  </div>
                );
              })}
          </div>
        ))}
      </div>
      <p aria-live="polite" className="sr-only">
        {open && term.trim().length >= 2
          ? loading
            ? "Searching."
            : `${options.length} suggestions.`
          : open && empty && options.length > 0
            ? `${options.length} recently viewed.`
            : ""}
      </p>
    </form>
  );
}
