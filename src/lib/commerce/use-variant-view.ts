"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ProductOption, VariantView } from "./types";
import { requestVariantView } from "./variant-client";
import {
  hasOptionParams,
  parseSelection,
  parseVariantId,
  selectionKey,
  selectionSearch,
  variantSelection,
  type Selection,
  type ViewStatus,
} from "./variant-selection";

type Result =
  | { key: string; attempt: number; view: VariantView | null }
  | { key: string; attempt: number; failed: true };

// Live variant state for the selection in the URL. Selecting a value
// rewrites the URL; the URL drives the request.
//
// On arrival, a URL that names options (or a Shopify ?variant= id) is
// rewritten to the variant Shopify resolved, so bad values drop out and a
// combination that doesn't exist falls back to the first available one.
// After the visitor picks a value themselves, their choice stays even when
// that combination doesn't exist; the panel says so instead.
//
// initialView (the cached default variant) fills in until the live answer
// arrives, when it matches what the URL asks for.
//
// The URL changes through history.replaceState, not the router: a router
// navigation would re-render the static product page on the server for
// every click. Next keeps useSearchParams in sync with history calls.
// Replace, not push, so option clicks don't fill the back button.
//
// inUrl false (quick add on a listing): the selection is kept in state and
// the page's URL is left alone.
export function useVariantView(
  handle: string,
  options: ProductOption[],
  initialView: VariantView | null,
  { inUrl = true }: { inUrl?: boolean } = {},
) {
  const urlParams = useSearchParams();
  const [localSearch, setLocalSearch] = useState("");
  const params = useMemo(
    () => (inUrl ? urlParams : new URLSearchParams(localSearch)),
    [inUrl, urlParams, localSearch],
  );
  const pathname = usePathname();
  const selection = useMemo(
    () => parseSelection(params, options),
    [params, options],
  );
  const variantId = parseVariantId(params);
  const key = selectionKey(selection) + (variantId ?? "");
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<Result | null>(null);

  const chose = useRef(false);

  const initialMatches =
    !variantId &&
    initialView?.variant != null &&
    (key === selectionKey({}) ||
      selectionKey(variantSelection(initialView.variant, options)) === key);
  const view =
    result && "view" in result
      ? result.view
      : initialMatches
        ? initialView
        : null;
  const resolvedKey = view?.variant
    ? selectionKey(variantSelection(view.variant, options))
    : null;
  // The last result answers this selection if it was asked for it, or if
  // Shopify resolved it to exactly this selection.
  const current =
    result !== null &&
    result.attempt === attempt &&
    (result.key === key || ("view" in result && resolvedKey === key));
  const status: ViewStatus = !current
    ? "loading"
    : "failed" in result
      ? "error"
      : "ready";

  useEffect(() => {
    if (current) return;
    const controller = new AbortController();
    requestVariantView(handle, selection, variantId, controller.signal).then(
      (next) => setResult({ key, attempt, view: next }),
      () => {
        if (!controller.signal.aborted) {
          setResult({ key, attempt, failed: true });
        }
      },
    );
    return () => controller.abort();
  }, [handle, key, attempt, current, selection, variantId]);

  const navigate = useCallback(
    (next: Selection) => {
      const search = selectionSearch(params, options, next);
      if (inUrl) window.history.replaceState(null, "", `${pathname}${search}`);
      else setLocalSearch(search);
    },
    [params, options, pathname, inUrl],
  );

  // On arrival, rewrite option params in the URL to what Shopify resolved.
  useEffect(() => {
    if (!inUrl || chose.current || status !== "ready" || !view?.variant) {
      return;
    }
    if (!hasOptionParams(params, options)) return;
    const resolved = selectionSearch(
      params,
      options,
      variantSelection(view.variant, options),
    );
    if (resolved !== search(params)) {
      window.history.replaceState(null, "", `${pathname}${resolved}`);
    }
  }, [inUrl, status, view, params, options, pathname]);

  const select = useCallback(
    (name: string, value: string) => {
      chose.current = true;
      const base = view?.variant
        ? { ...variantSelection(view.variant, options), ...selection }
        : selection;
      navigate({ ...base, [name]: value });
    },
    [view, options, selection, navigate],
  );

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  return { status, view, selection, select, retry };
}

function search(params: URLSearchParams): string {
  const query = params.toString();
  return query ? `?${query}` : "";
}
