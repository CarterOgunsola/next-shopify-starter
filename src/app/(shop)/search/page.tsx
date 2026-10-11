import type { Metadata } from "next";
import { Suspense } from "react";
import { SearchResults } from "@/components/shop/search-results";
import { browseQuery } from "@/lib/commerce/browse-url";
import { browse } from "@/lib/commerce/browse.server";
import { getBuyerContext } from "@/lib/commerce/buyer.server";
import { isShopIndexed, requireShop } from "@/lib/flags";

// Search results are never indexed; after launch their links may be
// followed.
export function generateMetadata(): Metadata {
  return {
    title: "Search",
    robots: { index: false, follow: isShopIndexed() },
  };
}

// A static shell with the results streamed in for the URL's term, filters,
// sort and page, so search works without JavaScript. Search has no handle,
// so reading the query on the server can't turn an unknown page into a
// 200. With JavaScript, later changes load in the browser.
export default function SearchPage({ searchParams }: PageProps<"/search">) {
  requireShop();
  return (
    <>
      <h1>Search</h1>
      <Suspense fallback={<SearchForm term="" />}>
        <ServerSearch searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function ServerSearch({
  searchParams,
}: {
  searchParams: PageProps<"/search">["searchParams"];
}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams)) {
    for (const item of [value ?? []].flat()) params.append(key, item);
  }
  const term = params.get("q")?.trim() ?? "";
  if (!term || term.length > 200) return <SearchResults />;
  const query = browseQuery(params);
  // Results that can't load here load in the browser instead.
  const initial = await browse(
    { query: term },
    query,
    await getBuyerContext(),
  ).catch(() => null);
  return (
    <SearchResults initial={initial} initialTerm={term} initialQuery={query} />
  );
}

function SearchForm({ term }: { term: string }) {
  return (
    <form method="get" action="/search" role="search">
      <label htmlFor="search-term">Search products</label>{" "}
      <input id="search-term" type="search" name="q" defaultValue={term} />{" "}
      <button type="submit">Search</button>
    </form>
  );
}
