import { env } from "cloudflare:workers";
import { documentRequest, scriptLanding } from "../../../lib/script-landing";

export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  if (documentRequest(req)) return scriptLanding();
  const logo = new URL(req.url).searchParams.get("asset") === "logo";
  const bucket = (env as unknown as { SCRIPT_FILES?: R2Bucket }).SCRIPT_FILES;
  const key = logo ? "tests/pet-ride/20261029-1-logo.png" : "tests/pet-ride/20261029-2.lua";
  const object = await bucket?.get(key);
  if (!object) return new Response("Pet Ride preview unavailable", { status: 503, headers: { "Cache-Control": "no-store" } });
  return new Response(object.body, { headers: {
    "Content-Type": logo ? "image/png" : "text/plain; charset=utf-8",
    "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff",
  } });
}
