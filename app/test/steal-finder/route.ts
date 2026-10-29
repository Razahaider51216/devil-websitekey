import { env } from "cloudflare:workers";
import { documentRequest, scriptLanding } from "../../../lib/script-landing";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  if (documentRequest(req)) return scriptLanding();
  const bucket = (env as unknown as { SCRIPT_FILES?: R2Bucket }).SCRIPT_FILES;
  const object = await bucket?.get("tests/steal-finder/v1.lua");
  if (!object) return new Response("Finder test is not published", { status: 503 });
  return new Response(object.body, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
}
