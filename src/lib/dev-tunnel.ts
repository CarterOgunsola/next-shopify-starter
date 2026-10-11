// A Cloudflare quick tunnel (cloudflared tunnel --url) in front of the dev
// server, for trying customer sign-in, which needs a public HTTPS origin:
// https://<random>.trycloudflare.com. Development only; production builds
// never trust these hosts.
export const DEV_TUNNEL_HOSTS = ["*.trycloudflare.com"];

export function isDevTunnelHost(host: string): boolean {
  return /^[a-z0-9-]+\.trycloudflare\.com$/i.test(host);
}
