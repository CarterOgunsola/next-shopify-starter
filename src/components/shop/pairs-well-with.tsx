"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { formatMoney, type ProductCard } from "@/lib/commerce";
import { useCart } from "@/lib/commerce/cart.client";

const SHOWN = 3;

// In the cart drawer: what goes with the product just added (Search &
// Discovery's complementary products), leaving out what's in the cart.
// Products that need nothing chosen can be added from here.
export function PairsWellWith({ handle }: { handle: string }) {
  const cart = useCart();
  const [products, setProducts] = useState<ProductCard[]>([]);
  const [announcement, setAnnouncement] = useState("");
  // Which product is being added, and one that couldn't be, with why.
  const [adding, setAdding] = useState<string | null>(null);
  const [failed, setFailed] = useState<{ id: string; error: string } | null>(
    null,
  );
  const list = useRef<HTMLUListElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  // After an add from the list, focus goes to the next item's control (the
  // added one leaves the list), or the heading when none is left.
  const focusAfter = useRef<number | null>(null);
  useEffect(() => {
    if (focusAfter.current === null) return;
    const items = list.current?.querySelectorAll<HTMLElement>(":scope > li");
    const next = items?.[Math.min(focusAfter.current, items.length - 1)];
    (
      next?.querySelector<HTMLElement>("button, a:last-of-type") ??
      heading.current
    )?.focus();
    focusAfter.current = null;
  });

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/commerce/recommendations?${new URLSearchParams({ handle })}`, {
      signal: controller.signal,
    })
      .then((response) => (response.ok ? response.json() : { products: [] }))
      .then((body: { products: ProductCard[] }) => setProducts(body.products))
      .catch(() => {});
    return () => controller.abort();
  }, [handle]);

  const inCart = new Set(
    cart.cart?.lines.map((line) => line.merchandise.product.handle) ?? [],
  );
  const shown = products
    .filter((product) => !inCart.has(product.handle))
    .slice(0, SHOWN);
  if (shown.length === 0) {
    return announcement ? (
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>
    ) : null;
  }

  const addFromList = async (product: ProductCard, index: number) => {
    if (adding || cart.pending) return;
    setAdding(product.id);
    setFailed(null);
    const result = await cart.add(
      [{ merchandiseId: product.quickAddVariantId!, quantity: 1 }],
      { keepAnchor: true, quiet: true },
    );
    setAdding(null);
    if (result.ok) {
      focusAfter.current = index;
      setAnnouncement(`Added ${product.title}.`);
    } else {
      setFailed({ id: product.id, error: result.error });
      setAnnouncement(result.error);
    }
  };

  return (
    <section aria-labelledby="drawer-pairs">
      <h3 id="drawer-pairs" ref={heading} tabIndex={-1}>
        Pairs well with
      </h3>
      <ul aria-label="Pairs well with" ref={list}>
        {shown.map((product, index) => (
          <li key={product.id}>
            <Link href={`/products/${product.handle}`}>{product.title}</Link>{" "}
            {formatMoney(product.price.min)}{" "}
            {product.quickAddVariantId ? (
              <>
                {/* Stays focusable while busy (aria-disabled, guarded). */}
                <button
                  type="button"
                  aria-disabled={adding !== null || cart.pending || undefined}
                  aria-label={`Add ${product.title} to cart`}
                  aria-describedby={
                    failed?.id === product.id
                      ? `${product.id}-error`
                      : undefined
                  }
                  onClick={() => addFromList(product, index)}
                >
                  {adding === product.id ? "Adding…" : "Add"}
                </button>
                {failed?.id === product.id && (
                  <p id={`${product.id}-error`}>{failed.error}</p>
                )}
              </>
            ) : (
              <Link
                href={`/products/${product.handle}`}
                aria-label={`Choose options for ${product.title}`}
              >
                Choose options
              </Link>
            )}
          </li>
        ))}
      </ul>
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </section>
  );
}
