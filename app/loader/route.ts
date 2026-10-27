import { serveBootstrap } from "../../lib/runtime-storage";
import { RequestError } from "../../lib/security";
import { documentRequest, scriptLanding } from "../../lib/script-landing";
export const dynamic = "force-dynamic";
export async function GET(req?: Request) {
  if (req && documentRequest(req)) return scriptLanding();
  try { return await serveBootstrap(); }
  catch (error) {
    return new Response("DEVIL HUB: domain loader unavailable; try again shortly", {
      status: error instanceof RequestError ? error.status : 503,
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
    });
  }
}
