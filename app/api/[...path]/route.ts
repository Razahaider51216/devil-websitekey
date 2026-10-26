import { handle, HttpError, json } from "../../../lib/server";
import { serviceErrorCode } from "../../../lib/service-errors";
export const dynamic = "force-dynamic";
async function route(req: Request, context: { params: Promise<{ path: string[] }> }) {
  try { return await handle(req, (await context.params).path); }
  catch (error) {
    if (error instanceof HttpError) return json({ error: error.message }, error.code);
    console.error("DEVIL KEY request failed", error instanceof Error ? error.message : "unknown error");
    return json({ error: "ระบบยังไม่พร้อม กรุณาลองอีกครั้งหรือติดต่อแอดมิน", code: serviceErrorCode(error) }, 503);
  }
}
export { route as GET, route as POST, route as DELETE };
