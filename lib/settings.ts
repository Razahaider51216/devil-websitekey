import { safeLink } from "./domain";

export const linkFields = ["discordUrl", "channelUrl", "videoUrl", "commentUrl", "likeUrl"] as const;
export type Mission = { title: string; subtitle: string; service: "DISCORD" | "YOUTUBE" | "COMMENT" | "LIKE" | "LINK"; url: string; waitSeconds: number };
export type Links = Record<(typeof linkFields)[number], string> & { sixHourService?: "discord" | "youtube"; missions?: Mission[] };

export function validateMissions(input: unknown): Mission[] {
  if (!Array.isArray(input) || !input.length) throw new Error("Add at least one link step");
  return input.map(item => {
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error("Invalid step");
    const { title, subtitle = "", service, url, waitSeconds } = item;
    if (typeof title !== "string" || !title.trim() || title.length > 160 || typeof subtitle !== "string" || subtitle.length > 320) throw new Error("Step title is required (up to 160 characters)");
    if (!["DISCORD", "YOUTUBE", "COMMENT", "LIKE", "LINK"].includes(service)) throw new Error("Invalid step service");
    if (!Number.isSafeInteger(waitSeconds) || waitSeconds < 0 || waitSeconds > Math.floor((Number.MAX_SAFE_INTEGER - Date.now()) / 1000)) throw new Error("Wait time must be a nonnegative whole number of seconds");
    const normalized = typeof url === "string" ? safeLink(url.trim()) : "";
    if (!normalized || url.length > 2048 || normalized.length > 2048) throw new Error("Use an HTTPS step link without credentials");
    return { title: title.trim(), subtitle: subtitle.trim(), service, url: normalized, waitSeconds };
  });
}

export function validateLinks(input: unknown): Links {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("ข้อมูลลิงก์ไม่ถูกต้อง");
  const record = input as Record<string, unknown>;
  if (Object.keys(record).some(key => key !== "sixHourService" && key !== "missions" && !linkFields.includes(key as typeof linkFields[number]))) throw new Error("ข้อมูลลิงก์ไม่ถูกต้อง");
  if (record.sixHourService !== undefined && record.sixHourService !== "discord" && record.sixHourService !== "youtube") throw new Error("Invalid mission service");
  const result = {} as Links;
  for (const field of linkFields) {
    if (typeof record[field] !== "string") throw new Error("กรุณากรอกลิงก์เป็นข้อความ");
    const value = record[field].trim();
    const normalized = value ? safeLink(value) : "";
    if (value.length > 2048 || normalized.length > 2048 || (value && !normalized)) throw new Error("ลิงก์ต้องขึ้นต้นด้วย https:// และไม่มีชื่อผู้ใช้หรือรหัสผ่าน");
    result[field] = normalized;
  }
  return { ...result, sixHourService: record.sixHourService === "youtube" ? "youtube" : "discord", ...(record.missions !== undefined ? { missions: validateMissions(record.missions) } : {}) };
}
