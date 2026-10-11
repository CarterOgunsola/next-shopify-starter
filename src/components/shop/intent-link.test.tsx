// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const prefetches = vi.hoisted(() => [] as unknown[]);
vi.mock("next/link", () => ({
  default: ({
    prefetch,
    children,
    ...props
  }: {
    prefetch: unknown;
    children: React.ReactNode;
  }) => {
    prefetches.push(prefetch);
    return <a {...props}>{children}</a>;
  },
}));

const { IntentLink } = await import("./intent-link");

afterEach(() => {
  cleanup();
  prefetches.length = 0;
});

describe("IntentLink", () => {
  it.each([
    ["hover", fireEvent.mouseEnter],
    ["focus", fireEvent.focus],
    ["touch", fireEvent.touchStart],
  ])("prefetches only after %s", (_, act) => {
    render(<IntentLink href="/products/tee">Tee</IntentLink>);
    expect(prefetches.at(-1)).toBe(false);
    act(screen.getByRole("link", { name: "Tee" }));
    expect(prefetches.at(-1)).toBeNull();
  });
});
