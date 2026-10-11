import { clientIp } from "@/lib/host/client-ip";
import { createRateLimiter } from "@/lib/rate-limit";

// Receives CSP violation reports (report-uri and Reporting API formats).
// Logs only the directive and the blocked origin: no full URLs, which can
// carry query strings with personal data. Anyone can post here, so the
// body, the number of reports and the rate per client are capped.

export const MAX_BODY = 16 * 1024;
export const MAX_REPORTS = 5;

type Violation = { directive?: string; blocked?: string };

function origin(value: unknown): string {
  if (typeof value !== "string") return "unknown";
  try {
    return new URL(value).origin;
  } catch {
    // "inline", "eval", "self" and similar keywords.
    return value.replace(/[^a-z-]/gi, "").slice(0, 20) || "unknown";
  }
}

export function summarize(body: unknown): Violation[] {
  const reports = (Array.isArray(body) ? body : [body]).slice(0, MAX_REPORTS);
  return reports.flatMap((report): Violation[] => {
    if (!report || typeof report !== "object") return [];
    const legacy = (report as Record<string, Record<string, unknown>>)[
      "csp-report"
    ];
    const modern = (report as Record<string, Record<string, unknown>>).body;
    const data = legacy ?? modern;
    if (!data) return [];
    return [
      {
        // Letters and dashes only, so a report can't forge log lines.
        directive:
          String(
            data["effective-directive"] ??
              data.effectiveDirective ??
              data["violated-directive"] ??
              "unknown",
          )
            .toLowerCase()
            .replace(/[^a-z-]/g, "")
            .slice(0, 40) || "unknown",
        blocked: origin(data["blocked-uri"] ?? data.blockedURL),
      },
    ];
  });
}

// Reads at most max bytes of the body; null when it's longer.
async function readCapped(
  request: Request,
  max: number,
): Promise<string | null> {
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}

const defaultAllow = createRateLimiter({ limit: 20, windowMs: 60 * 1000 });

export async function handleCspReport(
  request: Request,
  {
    allow = defaultAllow,
    log = (directive: string, blocked: string) =>
      console.warn("[csp]", directive, blocked),
  }: {
    allow?: (key: string) => boolean;
    log?: (directive: string, blocked: string) => void;
  } = {},
): Promise<Response> {
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_BODY) return new Response(null, { status: 413 });
  if (!allow(clientIp(request.headers) ?? "unknown")) {
    return new Response(null, { status: 429 });
  }
  const text = await readCapped(request, MAX_BODY);
  if (text === null) return new Response(null, { status: 413 });
  try {
    for (const violation of summarize(JSON.parse(text))) {
      log(violation.directive ?? "unknown", violation.blocked ?? "unknown");
    }
  } catch {
    // Not JSON. Ignore.
  }
  return new Response(null, { status: 204 });
}
