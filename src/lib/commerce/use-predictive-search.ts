"use client";

import { useEffect, useState } from "react";
import type { PredictiveResults } from "./types";

export const PREDICTIVE_ENDPOINT = "/api/commerce/predictive-search";
const DEBOUNCE_MS = 200;
const MIN_LENGTH = 2;

const EMPTY: PredictiveResults = { products: [], collections: [], queries: [] };

// Suggestions for a search term as it's typed: waits for a pause, cancels
// requests a newer term replaces, and stays empty for very short terms.
export function usePredictiveSearch(term: string) {
  const query = term.trim();
  const [state, setState] = useState<{
    query: string;
    results: PredictiveResults;
  }>({ query: "", results: EMPTY });

  useEffect(() => {
    if (query.length < MIN_LENGTH) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      fetch(`${PREDICTIVE_ENDPOINT}?q=${encodeURIComponent(query)}`, {
        signal: controller.signal,
      })
        .then((response) => (response.ok ? response.json() : EMPTY))
        .then((results: PredictiveResults) => setState({ query, results }))
        // Offline or failed: no suggestions, rather than "Searching." forever.
        .catch(() => {
          if (!controller.signal.aborted) setState({ query, results: EMPTY });
        });
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  const active = query.length >= MIN_LENGTH;
  return {
    results: active && state.query === query ? state.results : EMPTY,
    loading: active && state.query !== query,
  };
}
