import { safeLink } from "./domain";

export const linkFields = ["discordUrl", "channelUrl", "videoUrl", "commentUrl", "likeUrl"] as const;
export type Links = Record<(typeof linkFields)[number], string>;

export function validateLinks(input: unknown): Links {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("ข้อมูลลิงก์ไม่ถูกต้อง");
  const record = input as Record<string, unknown>;
  if (Object.keys(record).some(key => !linkFields.includes(key as typeof linkFields[number]))) throw new Error("ข้อมูลลิงก์ไม่ถูกต้อง");
  const result = {} as Links;
  for (const field of linkFields) {
    if (typeof record[field] !== "string") throw new Error("กรุณากรอกลิงก์เป็นข้อความ");
    const value = record[field].trim();
    const normalized = value ? safeLink(value) : "";
    if (value.length > 2048 || normalized.length > 2048 || (value && !normalized)) throw new Error("ลิงก์ต้องขึ้นต้นด้วย https:// และไม่มีชื่อผู้ใช้หรือรหัสผ่าน");
    result[field] = normalized;
  }
  return result;
}
