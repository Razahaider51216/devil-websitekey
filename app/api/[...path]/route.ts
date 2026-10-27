import { handle, HttpError, json } from "../../../lib/server";
import { serviceErrorCode } from "../../../lib/service-errors";
import { RequestError } from "../../../lib/security";
export const dynamic = "force-dynamic";
async function route(req: Request, context: { params: Promise<{ path: string[] }> }) {
  try { return await handle(req, (await context.params).path); }
  catch (error) {
    if (error instanceof HttpError) return json({ error: error.message }, error.code);
    if (error instanceof RequestError) return json({ error: error.message }, error.status);
    const code = serviceErrorCode(error);
    console.error("DEVIL KEY request failed", code);
    return json({ error: code === "DB_DAILY_LIMIT" ? "ฐานข้อมูลถึงโควตารายวัน กรุณาลองใหม่หลัง 07:00 น. (ไทย)" : "ระบบยังไม่พร้อม กรุณาลองอีกครั้งหรือติดต่อแอดมิน", code }, 503);
  }
}
export { route as GET, route as POST, route as DELETE };
