// What the site reads from a CMS, in the site's own types. Pages and
// components use these, never a CMS SDK's.

// A page the CMS publishes at a path of this site.
export type ContentPage = {
  path: string;
  title: string;
  // ISO 8601, for the sitemap's lastModified.
  updatedAt?: string;
};

export interface Content {
  // Every published page, for the sitemap.
  listPages(): Promise<ContentPage[]>;
}
