import { handleMenusRevalidate } from "@/lib/commerce/menus-revalidate.server";

export async function POST(request: Request) {
  return handleMenusRevalidate(request);
}
