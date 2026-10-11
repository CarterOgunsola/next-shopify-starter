// @vitest-environment jsdom
import { act, cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConsentProvider, useConsent, type UseConsent } from "./client";

// Runs our consent layer on the real c15t engine.

const reloads = vi.hoisted(() => ({ calls: [] as string[] }));
vi.mock("./reload", () => ({
  // Record what was saved at the moment of the reload.
  reloadPage: () => reloads.calls.push(savedConsent()),
}));

function savedConsent(): string {
  let stored = "";
  try {
    stored = window.localStorage.getItem("store_consent") ?? "";
  } catch {}
  return `${document.cookie} ${stored}`;
}

type Snapshot = Pick<UseConsent, "ready" | "state">;

function renderConsent() {
  const seen: Snapshot[] = [];
  const api: { current?: UseConsent } = {};
  function Probe() {
    const consent = useConsent();
    api.current = consent;
    seen.push({ ready: consent.ready, state: consent.state });
    return null;
  }
  const view = render(
    <ConsentProvider>
      <Probe />
    </ConsentProvider>,
  );
  return { seen, api, view };
}

function clearCookies() {
  for (const part of document.cookie.split(";")) {
    const name = part.split("=")[0].trim();
    if (name)
      document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
  }
}

beforeEach(() => {
  // jsdom has no matchMedia; c15t reads it for UI preferences.
  window.matchMedia ??= ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener() {},
    removeListener() {},
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;
  clearCookies();
  window.localStorage.clear();
  reloads.calls = [];
  document.cookie = "store_country=US; path=/";
});
afterEach(cleanup);

describe("consent on c15t", () => {
  it("saves a sale opt-out before reloading, and a new page load starts from it", async () => {
    const first = renderConsent();
    await waitFor(() => expect(first.api.current?.ready).toBe(true));
    // US: opt-out model, so marketing starts on.
    expect(first.api.current?.state.marketing).toBe(true);

    await act(async () => first.api.current!.setSaleOptOut(true));

    await waitFor(() => expect(reloads.calls).toHaveLength(1));
    expect(reloads.calls[0]).toMatch(/marketing/);
    expect(reloads.calls[0]).toMatch(
      /"marketing":false|marketing%22%3Afalse|marketing.?.?false/,
    );
    first.view.unmount();

    // "Reload": a fresh provider reads the saved choice before it's ready,
    // so there's never a ready state with marketing on.
    const second = renderConsent();
    await waitFor(() => expect(second.api.current?.ready).toBe(true));
    expect(
      second.seen
        .filter((s) => s.ready)
        .every((s) => s.state.marketing === false),
    ).toBe(true);
    expect(second.api.current?.state.saleOfData).toBe(false);
  });
});
