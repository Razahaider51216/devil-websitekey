import { env } from "cloudflare:workers";
import { guiPreviewResponse } from "../../../lib/gui-preview-delivery";
import { documentRequest, scriptLanding } from "../../../lib/script-landing";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  if (documentRequest(req)) return scriptLanding();
  return guiPreviewResponse((env as unknown as { SCRIPT_FILES?: R2Bucket }).SCRIPT_FILES);
}
