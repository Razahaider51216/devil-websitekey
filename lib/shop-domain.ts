import generatePayload from "promptpay-qr";
import { expiry, type Duration } from "./domain";
import { RequestError } from "./security";

export type Product = { id: string; name: string; description: string; priceSatang: number;
  durationKind: Duration["kind"]; durationAmount: number; enabled: boolean; sortOrder: number; updatedAt: number };
export type ShopSettings = { enabled: boolean; promptpayId: string; receiverName: string; receiverAliases: string[]; orderMinutes: number };
export type PaymentConfig = ShopSettings & { branchId: string };
export type VerifiedPayment = { transactionId: string; amountSatang: number; transferredAt: number; receivingBank: string };
export const shopSettingId = "shop:settings";
export const emptyShopSettings: ShopSettings = { enabled: false, promptpayId: "", receiverName: "", receiverAliases: [], orderMinutes: 20 };
export function satang(value: unknown): number {
  const text = typeof value === "number" && Number.isFinite(value) ? String(value) : typeof value === "string" ? value.trim() : "";
  if (!/^\d{1,8}(?:\.\d{1,2})?$/.test(text)) throw new RequestError(400, "ระบุราคาเป็นบาท ทศนิยมไม่เกิน 2 ตำแหน่ง");
  const [whole, fraction = ""] = text.split(".");return Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
}
export function validateProduct(value: unknown, id: string, now: number): Product {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new RequestError(400, "ข้อมูลสินค้าไม่ถูกต้อง");
  const input = value as Record<string, unknown>;
  if (typeof input.name !== "string" || !input.name.trim() || input.name.trim().length > 100
      || typeof input.description !== "string" || input.description.length > 1000) throw new RequestError(400, "ระบุชื่อสินค้าไม่เกิน 100 ตัวอักษรและรายละเอียดไม่เกิน 1,000 ตัวอักษร");
  const priceSatang = satang(input.price);
  if (priceSatang < 100 || priceSatang > 100_000_000) throw new RequestError(400, "ราคาต้องอยู่ระหว่าง 1–1,000,000 บาท");
  if (!["days", "months", "permanent"].includes(String(input.durationKind))) throw new RequestError(400, "เลือกรูปแบบอายุคีย์");
  const durationKind = input.durationKind as Duration["kind"], durationAmount = durationKind === "permanent" ? 0 : input.durationAmount;
  try { expiry(now, { kind: durationKind, amount: durationAmount as number }); }
  catch { throw new RequestError(400, "ระบุอายุคีย์ให้ถูกต้อง"); }
  if (typeof input.enabled !== "boolean" || !Number.isInteger(input.sortOrder) || Number(input.sortOrder) < 0 || Number(input.sortOrder) > 9999) throw new RequestError(400, "ตั้งค่าสถานะและลำดับสินค้าให้ถูกต้อง");
  return { id, name: input.name.trim(), description: input.description.trim(), priceSatang, durationKind,
    durationAmount: durationAmount as number, enabled: input.enabled, sortOrder: Number(input.sortOrder), updatedAt: now };
}
export function validateShopSettings(input: unknown): ShopSettings {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new RequestError(400, "ตั้งค่าการชำระเงินไม่ถูกต้อง");
  const value = input as Record<string, unknown>;
  const promptpayId = typeof value.promptpayId === "string" ? value.promptpayId.replace(/[\s-]/g, "") : "";
  if (!/^(?:0[689]\d{8}|\d{13})$/.test(promptpayId)) throw new RequestError(400, "ระบุพร้อมเพย์เป็นเบอร์มือถือ 10 หลักหรือเลขประจำตัว 13 หลัก");
  if (typeof value.receiverName !== "string" || value.receiverName.trim().length < 3 || value.receiverName.length > 160) throw new RequestError(400, "ระบุชื่อผู้รับเงินให้ตรงกับบัญชี");
  if (!Array.isArray(value.receiverAliases) || value.receiverAliases.length > 5 || value.receiverAliases.some(v => typeof v !== "string" || v.length < 3 || v.length > 160)) throw new RequestError(400, "ชื่อผู้รับเพิ่มเติมไม่ถูกต้อง");
  if (typeof value.enabled !== "boolean" || !Number.isInteger(value.orderMinutes) || Number(value.orderMinutes) < 15 || Number(value.orderMinutes) > 60) throw new RequestError(400, "กำหนดเวลาชำระเงินระหว่าง 15–60 นาที");
  return { enabled: value.enabled, promptpayId, receiverName: value.receiverName.trim(), receiverAliases: (value.receiverAliases as string[]).map(v => v.trim()), orderMinutes: Number(value.orderMinutes) };
}
export function paymentQr(config: PaymentConfig, amountSatang: number) {
  if (!Number.isSafeInteger(amountSatang) || amountSatang < 100) throw new RequestError(400, "ยอดชำระไม่ถูกต้อง");
  return generatePayload(config.promptpayId, { amount: amountSatang / 100 });
}
function receiverTokens(value: string) {
  return value.normalize("NFKC").toLowerCase().trim().replace(/^(?:นาย|นางสาว|นาง|mr\.?|mrs\.?|ms\.?)\s*/i, "").split(/\s+/).filter(Boolean);
}
export function receiverNameMatches(actual: unknown, expected: string) {
  if (typeof actual !== "string") return false;
  const observed = receiverTokens(actual), full = receiverTokens(expected);
  if (observed.length < 2 || observed.length > full.length || full.length < 2) return false;
  return observed.every((part, i) => {
    const known = part.replace(/[*xX•.]+$/g, "");
    if (!known || (i === 0 && known.length < 3)) return false;
    return (i === 0 && !/[*xX•.]/.test(part)) ? full[i] === known : full[i].startsWith(known);
  });
}
function timestamp(data: Record<string, unknown>) {
  if (typeof data.transTimestamp === "string") {
    if (!/(?:Z|[+-]\d\d:\d\d)$/.test(data.transTimestamp)) return NaN;
    return Date.parse(data.transTimestamp);
  }
  if (typeof data.transDate !== "string" || !/^\d{8}$/.test(data.transDate) || typeof data.transTime !== "string" || !/^\d\d:\d\d:\d\d$/.test(data.transTime)) return NaN;
  const day = `${data.transDate.slice(0,4)}-${data.transDate.slice(4,6)}-${data.transDate.slice(6,8)}`;
  const time = Date.parse(`${day}T${data.transTime}+07:00`);
  if (Number.isFinite(time) && new Date(time + 7 * 3600_000).toISOString().slice(0,19) !== `${day}T${data.transTime}`) return NaN;
  return time;
}
export function verifyPaymentData(data: unknown, order: { priceSatang: number; createdAt: number; expiresAt: number; payment: PaymentConfig }, now: number): VerifiedPayment {
  if (!data || typeof data !== "object") throw new RequestError(502, "ข้อมูลยืนยันการโอนไม่ครบ กรุณาติดต่อแอดมิน");
  const d = data as Record<string, unknown>;
  if (d.success !== true || typeof d.transRef !== "string" || !/^[A-Za-z0-9_-]{5,100}$/.test(d.transRef)
      || typeof d.sendingBank !== "string" || !/^\d{3}$/.test(d.sendingBank) || typeof d.receivingBank !== "string" || !/^(?:\d{3})?$/.test(d.receivingBank)) throw new RequestError(400, "สลิปไม่ผ่านการยืนยันจากธนาคาร");
  if (satang(d.amount) !== order.priceSatang) throw new RequestError(400, "ยอดโอนไม่ตรงกับคำสั่งซื้อ กรุณาโอนตามยอดที่แสดง");
  if (d.countryCode !== "TH" || (d.paidLocalCurrency !== undefined && d.paidLocalCurrency !== null && String(d.paidLocalCurrency) !== "764")) throw new RequestError(400, "รองรับการโอนเงินบาทในประเทศไทยเท่านั้น");
  const transferredAt = timestamp(d);
  if (!Number.isFinite(transferredAt) || transferredAt < Math.floor(order.createdAt / 1000) * 1000 || transferredAt > order.expiresAt || transferredAt > now + 60_000) throw new RequestError(400, "วันเวลาโอนไม่อยู่ในช่วงคำสั่งซื้อนี้ กรุณาติดต่อแอดมินหากโอนแล้ว");
  const receiver = d.receiver as { displayName?: unknown; name?: unknown; proxy?: { type?: unknown; value?: unknown } } | undefined;
  const names = [order.payment.receiverName, ...order.payment.receiverAliases];
  if (!receiver || !names.some(name => receiverNameMatches(receiver.displayName, name) || receiverNameMatches(receiver.name, name))) throw new RequestError(400, "ชื่อผู้รับไม่ตรงกับร้าน กรุณาติดต่อแอดมิน");
  if (receiver.proxy?.type === "MSISDN" && typeof receiver.proxy.value === "string" && order.payment.promptpayId.length === 10) {
    const observed = receiver.proxy.value.replace(/[\s()+-]/g, "").replace(/^66/, "0");
    const digits = observed.replace(/\D/g, "");
    if (observed.length !== 10 || digits.length < 4 || ![...observed].every((c, i) => !/\d/.test(c) || c === order.payment.promptpayId[i])) throw new RequestError(400, "หมายเลขผู้รับเงินไม่ตรงกับร้าน");
  }
  return { transactionId: `${d.sendingBank}:${d.transRef}`, amountSatang: order.priceSatang, transferredAt, receivingBank: d.receivingBank };
}
