import { request } from "node:http";
import { expect, test } from "./support/test";

// This build lists old-host.example in REDIRECT_HOSTS (support/server-env.mjs).
// Sent with node:http, since a browser picks its own Host header.
function get(url: URL, host: string) {
  return new Promise<{ status?: number; location?: string }>(
    (resolve, reject) => {
      request(url, { headers: { host } }, (response) => {
        response.resume();
        resolve({
          status: response.statusCode,
          location: response.headers.location,
        });
      })
        .on("error", reject)
        .end();
    },
  );
}

test("redirects a listed host to the site, keeping the path and query", async ({
  baseURL,
}) => {
  const url = new URL(
    "/collections/frontpage?sort_by=price-ascending&page=2",
    baseURL,
  );
  expect(await get(url, "old-host.example")).toEqual({
    status: 308,
    location: url.href,
  });
});

test("serves the site's own host", async ({ baseURL }) => {
  const url = new URL("/", baseURL);
  expect((await get(url, url.host)).status).toBe(200);
});
