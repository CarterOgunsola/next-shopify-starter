// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ChunkBoundary } from "./chunk-boundary";

afterEach(cleanup);

function Broken(): never {
  throw new Error("Failed to load chunk");
}

describe("ChunkBoundary", () => {
  it("offers a reload when its part of the page can't load", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    render(
      <ChunkBoundary>
        <Broken />
      </ChunkBoundary>,
    );
    expect(screen.getByRole("alert").textContent).toContain(
      "This part of the page couldn't load.",
    );
    expect(
      screen.getByRole("button", { name: "Reload the page" }),
    ).toBeTruthy();
    vi.restoreAllMocks();
  });
});
