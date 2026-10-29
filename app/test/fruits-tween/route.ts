import { env } from "cloudflare:workers";
import { documentRequest, scriptLanding } from "../../../lib/script-landing";
import { fruitsTween } from "../../../lib/fruits-tween-manifest";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (documentRequest(request)) return scriptLanding();
  try {
    const bucket = (env as unknown as { SCRIPT_FILES?: R2Bucket }).SCRIPT_FILES;
    const object = await bucket?.get(fruitsTween.key);
    if (!object || object.size !== fruitsTween.bytes) throw new Error("Missing artifact");
    const bytes = await object.arrayBuffer();
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    const sha256 = Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, "0")).join("");
    if (sha256 !== fruitsTween.sha256) throw new Error("Artifact integrity");
    return new Response(bytes, { headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    } });
  } catch {
    return new Response("DEVIL HUB Tween test unavailable; try again shortly", {
      status: 503, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
    });
  }
}
