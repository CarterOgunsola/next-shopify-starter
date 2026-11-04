import type { Metadata } from "next";
import Link from "next/link";
import { ProductGrid } from "@/components/shop/product-grid";
import { publicContext } from "@/lib/commerce/audience";
import { listProducts } from "@/lib/commerce/catalog.server";
import { requireShop } from "@/lib/flags";

export const metadata: Metadata = {
  title: "Shop",
  alternates: { canonical: "/shop" },
};

export default async function ShopPage() {
  requireShop();
  const products = await listProducts(publicContext());

  return (
    <>
      <h1>Shop</h1>
      <p>
        <Link href="/collections/all">Browse all products</Link>
      </p>
      {products.items.length === 0 ? (
        <p>No products yet.</p>
      ) : (
        <ProductGrid products={products.items} />
      )}
    </>
  );
}
