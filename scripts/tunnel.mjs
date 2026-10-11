// Steps for trying customer sign-in through a Cloudflare quick tunnel to the
// dev server. Prints what to run and register; never starts the tunnel.
//
//   pnpm tunnel                                    the steps
//   pnpm tunnel https://<random>.trycloudflare.com the values for that URL,
//                                                  and a check of sign-in
//
// Never prints a secret or the client id.

import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

const PORT = 4747;

// The tunnel's origin, or null if the URL isn't a quick tunnel.
export function tunnelOrigin(input) {
  let url;
  try {
    url = new URL(input);
  } catch {
    return null;
  }
  if (
    url.protocol !== "https:" ||
    url.port ||
    !/^[a-z0-9-]+\.trycloudflare\.com$/i.test(url.hostname)
  ) {
    return null;
  }
  return url.origin;
}

// What Shopify's Customer Account API needs registered for an origin, as
// Hydrogen's sign-in sends it: the callback is /account/authorize, the
// token request's Origin is the site, and sign-out returns to "/".
export function registration(origin) {
  return {
    callback: `${origin}/account/authorize`,
    javascriptOrigin: origin,
    logout: `${origin}/`,
  };
}

const steps = `Customer sign-in through a quick tunnel (development only)

1. Env (.env.local), then restart the dev server:
   SHOPIFY_CUSTOMER_CLIENT_ID       Customer Account API client id (public client, no secret)
   CUSTOMER_ACCOUNT_SESSION_SECRET  at least 32 random characters, e.g. openssl rand -base64 48
2. Start the dev server (pnpm dev, port ${PORT}), then the tunnel in another terminal:
   cloudflared tunnel --url http://localhost:${PORT}
   Keep the Host header as is (no --http-host-header).
3. Run pnpm tunnel <the https://....trycloudflare.com URL it prints> for the
   values to register under Hydrogen or Headless > Customer Account API >
   Application setup, and a check that sign-in starts with them.
4. Open the tunnel URL, then Account > Sign in.

Each tunnel run has a new URL: register it again, and remove the old one
when done.`;

export async function check(origin) {
  let response;
  try {
    response = await fetch(`${origin}/account/login`, { redirect: "manual" });
  } catch (error) {
    return `Couldn't reach the tunnel (${error instanceof Error ? error.message : error}). Is cloudflared running?`;
  }
  const location = response.headers.get("location") ?? "";
  if (response.status === 404) {
    return "Sign-in isn't set up: SHOPIFY_CUSTOMER_CLIENT_ID and CUSTOMER_ACCOUNT_SESSION_SECRET (32+ characters) in .env.local, then restart the dev server.";
  }
  if (location.includes("login=https")) {
    return "The dev server saw a plain-HTTP origin: restart it, and run cloudflared without --http-host-header.";
  }
  if (location.includes("login=unavailable")) {
    return "The dev server couldn't look up the shop id from the Storefront API. Check the store settings in .env.local.";
  }
  let target;
  try {
    target = new URL(location);
  } catch {
    return `Unexpected answer from /account/login (${response.status}).`;
  }
  const sent = target.searchParams.get("redirect_uri");
  if (target.hostname !== "shopify.com" || sent === null) {
    return `Unexpected redirect from /account/login (${response.status}, to ${target.hostname}).`;
  }
  return sent === registration(origin).callback
    ? "OK: sign-in starts, with the callback above."
    : `The callback sent (${sent}) isn't the tunnel's. Restart the dev server.`;
}

async function main() {
  const [input] = process.argv.slice(2);
  if (!input) {
    console.log(steps);
    return;
  }
  const origin = tunnelOrigin(input);
  if (!origin) {
    console.error(
      "Expected the tunnel's URL, like https://<random>.trycloudflare.com",
    );
    process.exitCode = 1;
    return;
  }
  const values = registration(origin);
  console.log(`Register under Customer Account API > Application setup:

  Callback URI         ${values.callback}
  JavaScript origin    ${values.javascriptOrigin}
  Logout URI           ${values.logout}
`);
  const result = await check(origin);
  console.log(result);
  if (!result.startsWith("OK")) process.exitCode = 1;
}

if (realpathSync(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  await main();
}
