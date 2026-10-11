import { handleShopSitemapIndex } from "@/lib/commerce/sitemap.server";

export async function GET() {
  return handleShopSitemapIndex();
}
