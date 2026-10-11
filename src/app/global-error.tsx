"use client";

// Shown when the root layout itself fails. It replaces the whole document.
export default function GlobalError({
  retry,
}: {
  error: Error;
  retry: () => void;
}) {
  return (
    <html lang="en">
      <body>
        <main>
          <h1>Something went wrong</h1>
          <p role="alert">The site couldn&apos;t load.</p>
          <p>
            <button type="button" onClick={retry}>
              Try again
            </button>{" "}
            {/* A full page load: the root layout is what failed. */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a href="/">Go to the home page</a>
          </p>
        </main>
      </body>
    </html>
  );
}
