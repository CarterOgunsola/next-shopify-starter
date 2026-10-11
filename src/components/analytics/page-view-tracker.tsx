"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { cleanUrl } from "@/lib/analytics/clean-url";
import { track } from "@/lib/analytics/track";
import { useConsent } from "@/lib/consent/client";

// One page_view per route, including client navigations. Also fires when
// analytics consent is granted, so the page the visitor accepted on counts.
// Path only: no query string, which can carry emails or discount codes.
//
// The page this document landed on is kept in memory (never stored or
// sent before consent): if analytics is granted after the visitor moved on
// within the site, the landing page's view goes first, so its campaign
// params (UTMs, click ids) still count. Without a grant it's never sent.
export function PageViewTracker() {
  const pathname = usePathname();
  const { ready, state } = useConsent();
  const analytics = ready && state.analytics;
  const [landing] = useState(() =>
    typeof window === "undefined"
      ? null
      : { path: pathname, location: cleanUrl(window.location.href) },
  );
  const landingHandled = useRef(false);

  useEffect(() => {
    if (!analytics) return;
    if (!landingHandled.current) {
      landingHandled.current = true;
      if (landing && landing.path !== pathname) track("page_view", landing);
    }
    track("page_view", {
      path: pathname,
      // For GTM's GA4 tag to use as page_location: otherwise it collects
      // the full URL, query string included.
      location: cleanUrl(window.location.href),
    });
  }, [pathname, analytics, landing]);

  return null;
}
