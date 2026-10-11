"use client";

import { Component, type ReactNode } from "react";

// Around a part of the page whose code loads on demand: if its code can't
// load (usually a new deploy replaced it), say so and offer a reload
// instead of breaking the page.
export class ChunkBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <p role="alert">
        This part of the page couldn&apos;t load.{" "}
        <button type="button" onClick={() => window.location.reload()}>
          Reload the page
        </button>
      </p>
    );
  }
}
