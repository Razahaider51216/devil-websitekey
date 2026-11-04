import { RequestError } from "./security";

export class SlipError extends RequestError {
  code: string; retryAfter: number;
  constructor(status: number, code: string, message: string, retryAfter = 0) { super(status, message);this.code = code;this.retryAfter = retryAfter; }
}
function completedBankData(value:unknown){
  if(!value || typeof value!=="object" || Array.isArray(value))return null;
  const data=value as Record<string,unknown>;
  if(data.success===true)return data;
  if(data.success===undefined && typeof data.transRef==="string" && /^[A-Za-z0-9_-]{5,100}$/.test(data.transRef)
      && typeof data.sendingBank==="string" && /^\d{3}$/.test(data.sendingBank)
      && typeof data.receivingBank==="string" && /^(?:\d{3})?$/.test(data.receivingBank)
      && typeof data.amount==="number" && Number.isFinite(data.amount) && data.amount>0
      && data.receiver && typeof data.receiver==="object" && !Array.isArray(data.receiver)
      && (typeof data.transTimestamp==="string" || typeof data.transDate==="string" && typeof data.transTime==="string"))return {...data,success:true};
  return null;
}
export async function checkSlip(file: File, amountSatang: number, branchId: string, apiKey: string, fetcher: typeof fetch = fetch) {
  if (!/^\d{1,12}$/.test(branchId) || !apiKey) throw new SlipError(503, "PAYMENT_CONFIG", "ระบบตรวจสลิปยังไม่พร้อม กรุณาติดต่อแอดมิน");
  const form = new FormData();form.set("files", file);form.set("log", "true");form.set("amount", (amountSatang / 100).toFixed(2));
  let response: Response;
  try { response = await fetcher(`https://api.slipok.com/api/line/apikey/${branchId}`, {
    // Workers supports manual/follow only. Reject redirects below rather than
    // forwarding the API key and uploaded payment slip to another location.
    method: "POST", headers: { "x-authorization": apiKey, "User-Agent": "DEVIL-HUB/1.1", "Accept": "application/json" }, body: form, signal: AbortSignal.timeout(30_000), redirect: "manual",
  }); } catch { throw new SlipError(503, "SLIP_UNAVAILABLE", "ติดต่อระบบตรวจสลิปไม่สำเร็จ กรุณาลองใหม่โดยไม่ต้องโอนซ้ำ", 30); }
  if (response.status >= 300 && response.status < 400) throw new SlipError(503, "SLIP_UNAVAILABLE", "ระบบตรวจสลิปไม่พร้อม กรุณาลองใหม่โดยไม่ต้องโอนซ้ำ", 30);
  let result: { success?: unknown; data?: unknown; code?: unknown };
  try { result = await response.json(); } catch { throw new SlipError(503, "SLIP_UNAVAILABLE", "ระบบตรวจสลิปไม่พร้อม กรุณาลองใหม่โดยไม่ต้องโอนซ้ำ", 30); }
  if (response.ok && result.success === true) return completedBankData(result.data) || result.data;
  const code = Number(result.code);
  // SlipOK returns the original bank-verified data with 1012. The caller must
  // still validate the invoice and atomically claim its transaction reference.
  // A duplicate code alone (or an incomplete/failed bank result) is never proof.
  // The live API omits nested success on completed records, including 1012.
  // Normalize only authenticated provider responses; never client payment data.
  if (response.status===400 && code===1012){const data=completedBankData(result.data);if(data)return data;}
  if (code === 1012) throw new SlipError(409, "SLIP_DUPLICATE", "สลิปนี้ถูกตรวจสอบแล้ว หากยังไม่ได้รับคีย์ กรุณาแจ้งเลขคำสั่งซื้อกับแอดมิน");
  if (code === 1013) throw new SlipError(400, "SLIP_AMOUNT", "ยอดโอนไม่ตรงกับคำสั่งซื้อ");
  if (code === 1014) throw new SlipError(400, "SLIP_RECEIVER", "บัญชีผู้รับไม่ตรงกับร้าน");
  if (code === 1010) {
    const data = result.data as { delay?: unknown } | undefined;
    const minutes = Math.max(1, Math.min(15, Number(data?.delay) || 5));
    throw new SlipError(409, "SLIP_BANK_DELAY", `ธนาคารกำลังประมวลผล กรุณารอ ${minutes} นาทีแล้วส่งสลิปเดิมอีกครั้ง ไม่ต้องโอนซ้ำ`, Math.ceil(minutes * 60));
  }
  if (code === 1009) throw new SlipError(503, "SLIP_BANK_UNAVAILABLE", "ธนาคารไม่พร้อมตรวจสอบ กรุณารอ 15 นาทีแล้วส่งสลิปเดิมอีกครั้ง ไม่ต้องโอนซ้ำ", 15 * 60);
  if (response.status >= 500) throw new SlipError(503, "SLIP_UNAVAILABLE", "ระบบตรวจสลิปไม่พร้อม กรุณาลองใหม่ภายหลัง ไม่ต้องโอนซ้ำ", 60);
  if ([1001,1002,1003,1004].includes(code)) throw new SlipError(503, "SLIP_CONFIG", "ระบบตรวจสลิปของร้านยังไม่พร้อม กรุณาติดต่อแอดมิน");
  throw new SlipError(400, "SLIP_INVALID", "ตรวจสอบสลิปไม่สำเร็จ กรุณาใช้รูปสลิปโอนเงินจริงที่เห็น QR ชัดเจน");
}
export async function readSlipUpload(req: Request) {
  const maximum = 4 * 1024 * 1024;
  const contentType = req.headers.get("content-type") || "";
  if (!/^multipart\/form-data;\s*boundary=/i.test(contentType)) throw new RequestError(415, "กรุณาอัปโหลดรูปสลิป");
  if (Number(req.headers.get("content-length")) > maximum + 32768) throw new RequestError(413, "รูปสลิปต้องไม่เกิน 4 MiB");
  const reader = req.body?.getReader();if (!reader) throw new RequestError(400, "ไม่มีรูปสลิป");
  let size = 0;const chunks: Uint8Array[] = [];let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => { reject(new RequestError(408, "อัปโหลดสลิปหมดเวลา"));void reader.cancel().catch(() => {}); }, 20_000); });
  try {
    while (true) {
      const item = await Promise.race([reader.read(), timeout]);if (item.done) break;
      size += item.value.byteLength;if (size > maximum + 32768) { void reader.cancel().catch(() => {});throw new RequestError(413, "รูปสลิปต้องไม่เกิน 4 MiB"); }
      chunks.push(item.value);
    }
  } finally { clearTimeout(timer!);reader.releaseLock(); }
  const bytes = new Uint8Array(size);let offset = 0;for (const chunk of chunks) { bytes.set(chunk, offset);offset += chunk.length; }
  let form: FormData;
  try { form = await new Response(bytes, { headers: { "Content-Type": contentType } }).formData(); }
  catch { throw new RequestError(400, "รูปแบบอัปโหลดไม่ถูกต้อง"); }
  const file = form.get("slip");
  if (!file || typeof file === "string" || !file.size || file.size > maximum) throw new RequestError(400, "เลือกรูปสลิปขนาดไม่เกิน 4 MiB");
  if ([...form.keys()].some(key => key !== "slip") || form.getAll("slip").length !== 1) throw new RequestError(400, "ส่งสลิปครั้งละหนึ่งรูป");
  const image = new Uint8Array(await file.arrayBuffer());
  const png = file.type === "image/png" && image.length >= 24 && [137,80,78,71,13,10,26,10].every((b,i) => image[i] === b);
  const jpg = file.type === "image/jpeg" && image.length >= 4 && image[0] === 255 && image[1] === 216 && image[image.length - 2] === 255 && image[image.length - 1] === 217;
  const webp = file.type === "image/webp" && image.length >= 20 && String.fromCharCode(...image.slice(0,4)) === "RIFF" && String.fromCharCode(...image.slice(8,12)) === "WEBP";
  if (!png && !jpg && !webp) throw new RequestError(415, "รองรับรูปสลิป PNG, JPG และ WebP เท่านั้น");
  return { file: new File([image], "slip." + (png ? "png" : jpg ? "jpg" : "webp"), { type: file.type }), bytes: image };
}
