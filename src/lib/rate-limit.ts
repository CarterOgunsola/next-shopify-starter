// Fixed-window limiter held in memory. Per server instance only, so it slows
// down a single noisy client but is not a global limit. Pair it with a
// Vercel WAF rate-limit rule on the routes that need a hard cap.

type Window = { count: number; resetAt: number };

export function createRateLimiter({
  limit,
  windowMs,
  now = Date.now,
}: {
  limit: number;
  windowMs: number;
  now?: () => number;
}) {
  const windows = new Map<string, Window>();

  return function allow(key: string): boolean {
    const time = now();
    const current = windows.get(key);
    if (!current || current.resetAt <= time) {
      // Drop expired entries so the map can't grow without bound.
      for (const [k, w] of windows) if (w.resetAt <= time) windows.delete(k);
      windows.set(key, { count: 1, resetAt: time + windowMs });
      return true;
    }
    current.count += 1;
    return current.count <= limit;
  };
}
