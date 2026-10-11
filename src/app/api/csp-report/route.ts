import { handleCspReport } from "@/lib/security/csp-report";

export async function POST(request: Request) {
  return handleCspReport(request);
}
