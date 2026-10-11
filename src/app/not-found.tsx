import type { Metadata } from "next";
import { NotFoundContent } from "@/components/not-found-content";

export const metadata: Metadata = { title: "Page not found" };

// The 404 page. Static: Next renders it within every route. Shopify's URL
// redirects for unknown URLs are checked in app/[...missing].
export default function NotFound() {
  return <NotFoundContent />;
}
