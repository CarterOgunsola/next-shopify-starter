"use client";

import { useSearchParams } from "next/navigation";
import type { Listing } from "@/lib/commerce";
import { SEARCH_SORTS } from "@/lib/commerce/browse-url";
import { ListingBrowser } from "./listing-browser";

// The search page. initial: the results the server rendered for
// initialTerm and initialQuery (browse params), so they show without
// JavaScript; other terms and views load in the browser.
export function SearchResults({
  initial = null,
  initialTerm = "",
  initialQuery = "",
}: {
  initial?: Listing | null;
  initialTerm?: string;
  initialQuery?: string;
}) {
  const term = useSearchParams().get("q")?.trim() ?? "";
  return (
    <>
      <form method="get" action="/search" role="search">
        <label htmlFor="search-term">Search products</label>{" "}
        {/* Uncontrolled so a plain submit works; keyed so a new term resets it. */}
        <input
          key={term}
          id="search-term"
          type="search"
          name="q"
          defaultValue={term}
        />{" "}
        <button type="submit">Search</button>
      </form>
      {term ? (
        <ListingBrowser
          key={term}
          source={{ query: term }}
          initial={term === initialTerm ? initial : null}
          initialQuery={initialQuery}
          sorts={SEARCH_SORTS}
          hidden={{ q: term }}
        />
      ) : (
        <p>Enter a word to search the shop.</p>
      )}
    </>
  );
}
