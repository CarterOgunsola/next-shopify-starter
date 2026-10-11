"use client";

import Link from "next/link";
import { useState, type ComponentProps } from "react";

// A link that prefetches only once the visitor shows intent (pointer over
// it, keyboard focus, or a touch starting), not when it scrolls into view.
// For grids of product tiles, where viewport prefetching would fetch every
// product page on the screen. Next's documented hover-prefetch pattern.
export function IntentLink(
  props: Omit<ComponentProps<typeof Link>, "prefetch">,
) {
  const [intent, setIntent] = useState(false);
  const show = () => setIntent(true);
  return (
    <Link
      {...props}
      prefetch={intent ? null : false}
      onMouseEnter={show}
      onFocus={show}
      onTouchStart={show}
    />
  );
}
