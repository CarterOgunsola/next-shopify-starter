import { handleShopSitemapPage } from "@/lib/commerce/sitemap.server";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ section: string; file: string }> },
) {
  const { section, file } = await params;
  return handleShopSitemapPage(section, file);
}
