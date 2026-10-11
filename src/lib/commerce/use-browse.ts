"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { browseQuery, hasBrowseParams, toSearch } from "./browse-url";
import type { Listing } from "./types";

export const BROWSE_ENDPOINT = "/api/commerce/browse";

export type BrowseSource = { collection: string } | { query: string };

type Result =
  | { key: string; attempt: number; listing: Listing }
  | { key: string; attempt: number; failed: true }
  // Shopify rejected the URL's filters (400): retrying won't help.
  | { key: string; attempt: number; invalid: true };

class InvalidBrowse extends Error {}

// A listing driven by the URL. The server renders one view (initial, for
// the browse params in initialQuery: "" is the default view); any other
// view of filters, sort and pages loads from the browse endpoint. URL
// changes use history.pushState, so the back button undoes a filter or
// page, and the static page isn't re-rendered on the server.
export function useBrowse(
  source: BrowseSource | null,
  initial: Listing | null,
  initialQuery = "",
) {
  const params = useSearchParams();
  const pathname = usePathname();
  const query = browseQuery(params);
  const sourceKey = source
    ? "collection" in source
      ? `collection=${encodeURIComponent(source.collection)}`
      : `q=${encodeURIComponent(source.query)}`
    : null;
  const useInitial =
    initial !== null &&
    (hasBrowseParams(params) ? query === initialQuery : initialQuery === "");
  const key = `${sourceKey}&${query}`;
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<Result | null>(null);
  const [last, setLast] = useState<Listing | null>(initial);

  const current =
    result !== null && result.key === key && result.attempt === attempt;

  useEffect(() => {
    if (!sourceKey || useInitial || current) return;
    const controller = new AbortController();
    fetch(`${BROWSE_ENDPOINT}?${sourceKey}${query ? `&${query}` : ""}`, {
      signal: controller.signal,
    })
      .then((response) => {
        if (response.status === 400) throw new InvalidBrowse();
        if (!response.ok) throw new Error(String(response.status));
        return response.json() as Promise<Listing>;
      })
      .then(
        (listing) => {
          setResult({ key, attempt, listing });
          setLast(listing);
        },
        (error: unknown) => {
          if (controller.signal.aborted) return;
          setResult(
            error instanceof InvalidBrowse
              ? { key, attempt, invalid: true }
              : { key, attempt, failed: true },
          );
        },
      );
    return () => controller.abort();
  }, [sourceKey, query, key, attempt, useInitial, current]);

  const listing = useInitial
    ? initial
    : current && "listing" in result
      ? result.listing
      : last;
  const status: "ready" | "loading" | "error" | "invalid" =
    !sourceKey || useInitial
      ? "ready"
      : !current
        ? "loading"
        : "failed" in result
          ? "error"
          : "invalid" in result
            ? "invalid"
            : "ready";

  const navigate = useCallback(
    (next: URLSearchParams) => {
      window.history.pushState(null, "", `${pathname}${toSearch(next)}`);
    },
    [pathname],
  );

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  return { listing, status, params, pathname, navigate, retry };
}
