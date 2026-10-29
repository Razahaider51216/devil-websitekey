import { env } from "cloudflare:workers";
import { documentRequest, scriptLanding } from "../../../lib/script-landing";
import { bloxTest } from "../../../lib/blox-test-manifest";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (documentRequest(req)) return scriptLanding();
  const bucket = (env as unknown as { SCRIPT_FILES?: R2Bucket }).SCRIPT_FILES;
  try {
    const object = await bucket?.get(bloxTest.key);
    if (!object || object.size !== bloxTest.bytes) throw new Error("Unavailable");
    const data = await object.arrayBuffer();
    const digest = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", data)), b => b.toString(16).padStart(2, "0")).join("");
    if (digest !== bloxTest.sha256) throw new Error("Integrity");
    return new Response(data, { headers: {
      "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    } });
  } catch {
    return new Response("Blox Fruits test unavailable; try again shortly", {
      status: 503, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
    });
  }
}
