"use client";

import { clearRecentlyViewed } from "@/lib/commerce/recently-viewed";

// A plain form post (works without JavaScript). Signing out also forgets
// this browser's recently viewed products.
export function SignOutForm() {
  return (
    <form
      method="post"
      action="/account/logout"
      onSubmit={() => clearRecentlyViewed()}
    >
      <button type="submit">Sign out</button>
    </form>
  );
}
