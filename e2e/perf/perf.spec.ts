import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";

// pnpm perf: Core Web Vitals and script size per page, on the production
// build against the synthetic store, as a phone on a slow connection sees
// them. Budgets are in budgets.json.
//
// Plain Playwright, not the end-to-end fixture: that one routes every
// request through Playwright, which skips the browser's network
// throttling. The server's own requests still go to the synthetic store
// (the preload). Product images (Shopify's CDN, out of reach here) are a
// typical 828px JPEG, served after the time slow 4G would take; any other
// outside host is refused.

type Budget = { lcpMs: number; cls: number; tbtMs: number; jsKb: number };
const config = JSON.parse(
  readFileSync(join(process.cwd(), "e2e/perf/budgets.json"), "utf8"),
) as {
  default: Budget;
  pages: Record<string, Partial<Budget> & { path: string }>;
};
const image = readFileSync(join(process.cwd(), "e2e/perf/product.jpg"));

// Collected in the page from the start: largest contentful paint, layout
// shifts without recent input, and long tasks (total blocking time).
declare global {
  interface Window {
    __perf: { lcp: number; cls: number; longTasks: number[]; fcp: number };
  }
}
function observe() {
  window.__perf = { lcp: 0, cls: 0, longTasks: [], fcp: 0 };
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) window.__perf.lcp = entry.startTime;
  }).observe({ type: "largest-contentful-paint", buffered: true });
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries() as (PerformanceEntry & {
      value: number;
      hadRecentInput: boolean;
    })[]) {
      if (!entry.hadRecentInput) window.__perf.cls += entry.value;
    }
  }).observe({ type: "layout-shift", buffered: true });
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      if (entry.startTime >= window.__perf.fcp) {
        window.__perf.longTasks.push(entry.duration);
      }
    }
  }).observe({ type: "longtask", buffered: true });
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      if (entry.name === "first-contentful-paint") {
        window.__perf.fcp = entry.startTime;
      }
    }
  }).observe({ type: "paint", buffered: true });
}

// Slow 4G, as Lighthouse's mobile setting has it.
const DOWN_BYTES_PER_S = (1.6 * 1024 * 1024) / 8;

for (const [name, page] of Object.entries(config.pages)) {
  const budget = { ...config.default, ...page };
  test(`${name} stays within its budget`, async ({ page: tab, context }) => {
    const local = new URL(test.info().project.use.baseURL!).origin;
    await context.route(
      (url) => url.origin !== local,
      async (route) => {
        const request = route.request();
        if (
          new URL(request.url()).host === "cdn.shopify.com" &&
          request.resourceType() === "image"
        ) {
          // What slow 4G would take: its latency plus the transfer.
          await new Promise((resolve) =>
            setTimeout(resolve, 150 + (image.length / DOWN_BYTES_PER_S) * 1000),
          );
          return route.fulfill({ body: image, contentType: "image/jpeg" });
        }
        return route.abort("blockedbyclient");
      },
    );
    const cdp = await context.newCDPSession(tab);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
    await cdp.send("Network.enable");
    // Lighthouse's slow 4G: 150 ms, 1.6 Mbps down, 750 kbps up.
    await cdp.send("Network.emulateNetworkConditions", {
      offline: false,
      latency: 150,
      downloadThroughput: DOWN_BYTES_PER_S,
      uploadThroughput: (750 * 1024) / 8,
    });
    await tab.addInitScript(observe);
    await tab.goto(budget.path, { waitUntil: "load" });
    // Let late work (hydration, consent, live prices) finish.
    await tab.waitForTimeout(3000);
    const measured = await tab.evaluate(() => {
      const scripts = performance
        .getEntriesByType("resource")
        .filter(
          (entry): entry is PerformanceResourceTiming =>
            (entry as PerformanceResourceTiming).initiatorType === "script",
        );
      return {
        lcpMs: Math.round(window.__perf.lcp),
        cls: Number(window.__perf.cls.toFixed(3)),
        tbtMs: Math.round(
          window.__perf.longTasks.reduce(
            (sum, d) => sum + Math.max(0, d - 50),
            0,
          ),
        ),
        jsKb: Math.round(
          scripts.reduce((sum, entry) => sum + entry.transferSize, 0) / 1024,
        ),
      };
    });
    console.log(`[perf] ${name}: ${JSON.stringify(measured)}`);
    expect.soft(measured.lcpMs, "LCP").toBeLessThanOrEqual(budget.lcpMs);
    expect.soft(measured.cls, "CLS").toBeLessThanOrEqual(budget.cls);
    expect.soft(measured.tbtMs, "TBT").toBeLessThanOrEqual(budget.tbtMs);
    if (budget.jsKb > 0) {
      expect.soft(measured.jsKb, "JS KB").toBeLessThanOrEqual(budget.jsKb);
    }
  });
}
