import Link from "next/link";
import type { MenuItem } from "@/lib/commerce";

// A menu item's link: this site's routes through Link, other sites as
// plain links. An item without a link shows as text.
export function MenuLink({
  item,
  label = item.title,
}: {
  item: MenuItem;
  label?: string;
}) {
  if (!item.url) return <span>{label}</span>;
  if (item.external) {
    return (
      <a href={item.url} rel="noopener">
        {label}
      </a>
    );
  }
  return <Link href={item.url}>{label}</Link>;
}

// A second-level item and its own children, as a labeled list.
export function MenuGroup({ item }: { item: MenuItem }) {
  return (
    <>
      <MenuLink item={item} />
      {item.items.length > 0 && (
        <ul aria-label={item.title}>
          {item.items.map((child) => (
            <li key={`${child.title}:${child.url}`}>
              <MenuLink item={child} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
