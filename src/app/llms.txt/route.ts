import { handleLlmsTxt } from "@/lib/commerce/agent-text.server";

export async function GET() {
  return handleLlmsTxt();
}
