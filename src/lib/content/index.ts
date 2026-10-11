import "server-only";
import type { Content } from "./types";

// The CMS extension point, and the only module that may talk to a CMS
// (ESLint keeps CMS packages out of everything else; see the cms group in
// eslint.config.mjs). Nothing is connected: the site's own pages are the
// home page and the legal pages in src/app.
//
// To add a CMS: install its SDK, implement `content` here (cache reads with
// "use cache" and a tag your CMS webhook expires), extend `Content` in
// types.ts with what your pages need, and add routes in src/app that call
// it. Remember to list new routes in src/lib/commerce/app-routes.ts.

export type * from "./types";

export const content: Content = {
  async listPages() {
    return [];
  },
};
