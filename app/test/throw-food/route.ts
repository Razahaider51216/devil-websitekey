import { env } from "cloudflare:workers";
import { documentRequest, scriptLanding } from "../../../lib/script-landing";

export const dynamic = "force-dynamic";
const file = {
  key: "tests/throw-food/20261029-1.lua",
  bytes: 425442,
  sha256: "da7e8a348106d6714f94c152631173fa9318f441f6b703486363a7f6d185751e",
};

export async function GET(req: Request) {
  if (documentRequest(req)) return scriptLanding();
  try {
    const bucket = (env as unknown as { SCRIPT_FILES?: R2Bucket }).SCRIPT_FILES;
    const object = await bucket?.get(file.key);
    if (!object || object.size !== file.bytes) throw new Error("Unavailable");
    const data = await object.arrayBuffer();
    const hash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", data)), b => b.toString(16).padStart(2, "0")).join("");
    if (hash !== file.sha256) throw new Error("Integrity");
    return new Response(data, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
  } catch {
    return new Response("DEVIL HUB test unavailable; try again shortly", { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
