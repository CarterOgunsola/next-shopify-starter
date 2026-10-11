import { handleMarkdownPage } from "@/lib/commerce/agent-text.server";

// Markdown versions of product, collection and policy pages. src/proxy.ts
// rewrites a request that asks for text/markdown here.
export async function GET(
  _request: Request,
  { params }: RouteContext<"/md/[section]/[handle]">,
) {
  const { section, handle } = await params;
  return handleMarkdownPage(section, handle);
}
