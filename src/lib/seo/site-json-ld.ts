import { BRAND } from "@/lib/brand";
// schema.org Organization and WebSite for the home page. The site search
// action exists only while the shop (and its /search) is on.
export const SITE_NAME = BRAND.name;

export function siteJsonLd(site: string, { search }: { search: boolean }) {
  const url = new URL("/", site).href;
  return [
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      name: SITE_NAME,
      url,
    },
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: SITE_NAME,
      url,
      ...(search
        ? {
            potentialAction: {
              "@type": "SearchAction",
              target: {
                "@type": "EntryPoint",
                urlTemplate: `${new URL("/search", site).href}?q={search_term_string}`,
              },
              "query-input": "required name=search_term_string",
            },
          }
        : {}),
    },
  ];
}
