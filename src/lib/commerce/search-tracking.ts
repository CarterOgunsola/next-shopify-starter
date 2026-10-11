// A link from search results with Shopify's search tracking params
// (_pos, _sid, _ss and the like) appended, so Shopify's search analytics
// see which result the visitor followed. Anything that isn't a plain query
// string is ignored.
export function withSearchTracking(
  path: string,
  trackingParameters: string | null | undefined,
): string {
  if (!trackingParameters || !/^[\w.~%=&+-]+$/.test(trackingParameters)) {
    return path;
  }
  return `${path}${path.includes("?") ? "&" : "?"}${trackingParameters}`;
}
