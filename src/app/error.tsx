"use client";

import Link from "next/link";

// Shown when a page fails to render. Unstyled; the site's layout stays.
export default function Error({ retry }: { error: Error; retry: () => void }) {
  return (
    <section aria-labelledby="error-heading">
      <h1 id="error-heading">Something went wrong</h1>
      <p role="alert">This page couldn&apos;t load.</p>
      <p>
        <button type="button" onClick={retry}>
          Try again
        </button>{" "}
        <Link href="/">Go to the home page</Link>
      </p>
    </section>
  );
}
