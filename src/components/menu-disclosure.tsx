"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { MenuItem } from "@/lib/commerce";
import { MenuGroup, MenuLink } from "./menu-link";

// A header menu item with children, as a disclosure: a button that shows
// and hides its links (click, Enter or Space; not hover). Escape closes it
// and returns focus to the button; so do moving focus or clicking
// elsewhere, and following one of its links.
export function MenuDisclosure({ item }: { item: MenuItem }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);

  return (
    <div
      ref={root}
      onKeyDown={(event) => {
        if (event.key === "Escape" && open) {
          event.stopPropagation();
          setOpen(false);
          button.current?.focus();
        }
      }}
      // Focus moving to something outside closes it. A blur with nowhere
      // to go (Safari doesn't focus links and buttons on click, and a click
      // on text focuses nothing) is left to the pointer-down check, or a
      // click inside would close the list before it lands.
      onBlur={(event) => {
        const next = event.relatedTarget as Node | null;
        if (next && !root.current?.contains(next)) setOpen(false);
      }}
    >
      <button
        ref={button}
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((was) => !was)}
      >
        {item.title}
      </button>
      <ul
        id={id}
        hidden={!open}
        onClick={(event) => {
          if ((event.target as Element).closest("a")) setOpen(false);
        }}
      >
        {item.url && (
          <li>
            <MenuLink item={item} label={`All ${item.title}`} />
          </li>
        )}
        {item.items.map((child) => (
          <li key={`${child.title}:${child.url}`}>
            <MenuGroup item={child} />
          </li>
        ))}
      </ul>
    </div>
  );
}
