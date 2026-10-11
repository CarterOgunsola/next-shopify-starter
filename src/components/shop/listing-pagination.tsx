"use client";

import type { Page, ProductCard } from "@/lib/commerce";
import { toSearch, withPage } from "@/lib/commerce/browse-url";

// Previous and next as GET links with cursors (stable, shareable URLs).
export function ListingPagination({
  pathname,
  page,
  params,
  onChange,
}: {
  pathname: string;
  page: Page<ProductCard>;
  params: URLSearchParams;
  onChange: (next: URLSearchParams) => void;
}) {
  if (!page.previousCursor && !page.nextCursor) return null;
  const link = (
    cursor: string,
    direction: "after" | "before",
    text: string,
  ) => {
    const next = withPage(params, cursor, direction);
    return (
      <a
        href={`${pathname}${toSearch(next)}`}
        onClick={(event) => {
          event.preventDefault();
          onChange(next);
        }}
      >
        {text}
      </a>
    );
  };
  return (
    <nav aria-label="Pages">
      {page.previousCursor &&
        link(page.previousCursor, "before", "Previous page")}{" "}
      {page.nextCursor && link(page.nextCursor, "after", "Next page")}
    </nav>
  );
}
