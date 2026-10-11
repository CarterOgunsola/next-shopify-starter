import { BRAND } from "@/lib/brand";
import Link from "next/link";

export function NotFoundContent() {
  return (
    <>
      <h1>Page not found</h1>
      <p>
        <Link href="/">Back to {BRAND.siteName}</Link>
      </p>
    </>
  );
}
