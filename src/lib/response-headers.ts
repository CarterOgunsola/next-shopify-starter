// The headers every response gets: the security headers
// (security/headers.ts) and, until launch, noindex (indexing.ts).
// next.config.ts builds the list once per build, applies it to every path
// with headers(), and hands the same list to src/proxy.ts for the responses
// it answers itself. On Cloudflare those skip headers(): OpenNext returns
// them as they are.

export type ResponseHeader = { key: string; value: string };

// next.config.ts's compiler.defineServer swaps this for the list, as JSON,
// in server code at build. So the proxy sends what the build decided, even
// where the running site's variables differ from the build's.
export const RESPONSE_HEADERS_DEFINE = "process.env.RESPONSE_HEADERS";

// Unset outside a Next build; unit tests set it themselves.
export function builtResponseHeaders(): ResponseHeader[] {
  return JSON.parse(process.env.RESPONSE_HEADERS ?? "[]");
}

// response, with each of headers it doesn't already have. A header the
// response sets itself stays as it is: next start, which also applies
// next.config.ts headers to these responses, lets the response's own win
// too, so each header goes out once.
export function withResponseHeaders(
  response: Response,
  headers: ResponseHeader[] = builtResponseHeaders(),
): Response {
  const missing = headers.filter(({ key }) => !response.headers.has(key));
  if (missing.length === 0) return response;
  // A copy: the headers of fetch() and Response.redirect() answers can't
  // change.
  const merged = new Headers(response.headers);
  for (const { key, value } of missing) merged.set(key, value);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: merged,
  });
}
