// The page URL as analytics may see it: origin and path, plus campaign and
// attribution params only. Everything else in the query is dropped: search
// terms (q), filter values, return paths and anything a link might carry
// (emails, codes).
// Ad platforms' click and campaign ids (Google, Microsoft, Meta, TikTok,
// X, LinkedIn, Pinterest, Snapchat, Klaviyo), Google's cross-domain linker,
// and Shopify's search tracking. Matched without regard to case.
const KEEP =
  /^(utm_[a-z_]+|gclid|gbraid|wbraid|gad_source|gad_campaignid|dclid|srsltid|_gl|fbclid|msclkid|ttclid|twclid|li_fat_id|epik|sccid|_kx|dt_id|_pos|_sid|_ss)$/i;

export function cleanUrl(href: string): string {
  const url = new URL(href);
  const kept = new URLSearchParams(
    [...url.searchParams].filter(([key]) => KEEP.test(key)),
  );
  const query = kept.toString();
  return `${url.origin}${url.pathname}${query ? `?${query}` : ""}`;
}

// A page whose URL holds what the visitor typed or picked: the search page,
// or any page with a search term or filter values in its query. Scripts
// that report the page's own location (Shopify's analytics does, whatever
// the event says) mustn't run an event there.
const VISITOR_TEXT = /^(q|filter\..+)$/i;

export function carriesVisitorText(href: string): boolean {
  const url = new URL(href);
  return (
    url.pathname === "/search" ||
    [...url.searchParams.keys()].some((key) => VISITOR_TEXT.test(key))
  );
}
