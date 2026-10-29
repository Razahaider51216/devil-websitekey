import { env } from "cloudflare:workers";
import { documentRequest, scriptLanding } from "./script-landing";
import { dumpFiles } from "./dump-manifest";
export async function serveDump(req: Request, name: string) {
  if (!Object.hasOwn(dumpFiles, name)) return new Response("Not found", { status: 404 });
  const file = dumpFiles[name as keyof typeof dumpFiles];
  if (!name.endsWith(".png") && documentRequest(req)) return scriptLanding();
  const bucket = (env as unknown as { SCRIPT_FILES?: R2Bucket }).SCRIPT_FILES;
  try {
    const object = await bucket?.get(file.key);
    if (!object || object.size !== file.bytes) throw new Error("Unavailable");
    const data = await object.arrayBuffer();
    const hash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", data)), b => b.toString(16).padStart(2, "0")).join("");
    if (hash !== file.sha256) throw new Error("Integrity");
    return new Response(data, { headers: { "Content-Type": file.contentType, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
  } catch {
    return new Response("DEVIL DUMP unavailable; try again shortly", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
  }
}
