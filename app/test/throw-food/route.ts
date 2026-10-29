import { documentRequest, scriptLanding } from "../../../lib/script-landing";
export const dynamic = "force-dynamic";
// Keep the previously shared link usable through the same authenticated main loader.
export async function GET(req: Request) {
  if (documentRequest(req)) return scriptLanding();
  return new Response('return loadstring(game:HttpGet("https://devil-hub.dev/loader"))()\n', {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
}
