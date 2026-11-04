import { SlipError } from "./slipok";

// Image/proof writes use deterministic keys. Retrying them cannot charge a
// customer or issue a key, and never repeats the provider verification call.
export async function paymentStorage<T>(operation: () => Promise<T>,
  pause: () => Promise<void> = () => new Promise(resolve => setTimeout(resolve, 1100))): Promise<T> {
  try { return await operation(); } catch { /* Retry one transient storage failure. */ }
  await pause();
  try { return await operation(); }
  catch { throw new SlipError(503, "SLIP_STORAGE_UNAVAILABLE",
    "บันทึกหลักฐานสลิปในระบบไม่สำเร็จ กรุณาส่งสลิปเดิมอีกครั้ง ไม่ต้องโอนซ้ำ หากยังไม่ได้ให้แจ้งเลขคำสั่งซื้อกับแอดมิน", 30); }
}
