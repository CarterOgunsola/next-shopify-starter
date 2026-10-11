import { isDevTunnelHost } from "../dev-tunnel";

// The origin the visitor used. Behind Vercel (or a local TLS proxy) the
// request URL Next sees can be internal, so the forwarded host and protocol
// win when present. On Vercel those headers are set by the platform.
// In development, a quick tunnel's host is always HTTPS (the dev server
// itself is plain HTTP and may report that).
export function requestOrigin(
  request: Request,
  dev = process.env.NODE_ENV !== "production",
): string {
  const url = new URL(request.url);
  const host =
    request.headers.get("x-forwarded-host")?.split(",")[0]?.trim() || url.host;
  if (dev && isDevTunnelHost(host)) return `https://${host.toLowerCase()}`;
  const proto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  return `${proto || url.protocol.replace(":", "")}://${host}`;
}
