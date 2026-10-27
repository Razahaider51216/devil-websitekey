import { serveBootstrap } from "../../lib/runtime-storage";
import { RequestError } from "../../lib/security";
export const dynamic = "force-dynamic";
export async function GET() {
  try { return await serveBootstrap(); }
  catch (error) {
    return new Response("DEVIL HUB: domain loader unavailable; try again shortly", {
      status: error instanceof RequestError ? error.status : 503,
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
    });
  }
}
