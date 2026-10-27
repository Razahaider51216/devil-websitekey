export const WAIT_MS = 30_000;
export type Duration = { kind: "permanent" | "days" | "months"; amount: number };
export function expiry(at: number, duration: Duration) {
  if (duration.kind === "permanent") return null;
  if (!Number.isInteger(duration.amount) || duration.amount < 1 || duration.amount > (duration.kind === "days" ? 3650 : 120)) throw new Error("ระบุอายุคีย์ให้ถูกต้อง");
  if (duration.kind === "days") return at + duration.amount * 86_400_000;
  const date = new Date(at); const day = date.getUTCDate();
  date.setUTCDate(1); date.setUTCMonth(date.getUTCMonth() + duration.amount);
  const end = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(day, end)); return date.getTime();
}
export function stepState(step: { openedAt: number | null; returnedAt: number | null }, now: number, waitMs = WAIT_MS) {
  if (step.openedAt === null) return "ready";
  if (step.returnedAt === null || step.returnedAt < step.openedAt) return "opened";
  return now >= step.returnedAt + waitMs ? "done" : "waiting";
}
export async function hash(value: string) {
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))), b => b.toString(16).padStart(2, "0")).join("");
}
export async function keyFor(id: string, secret: string) {
  if (secret.length < 32) throw new Error("KEY_SECRET must contain at least 32 characters");
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const bytes = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(id)));
  const text = Array.from(bytes.slice(0, 16), b => b.toString(16).padStart(2, "0")).join("").toUpperCase();
  return `DEVIL-${text.match(/.{8}/g)!.join("-")}`;
}
export function status(key: { revokedAt: number | null; expiresAt: number | null }, now: number) {
  return key.revokedAt !== null ? "revoked" : key.expiresAt !== null && key.expiresAt <= now ? "expired" : "active";
}
export function safeLink(value: string) {
  try { const u = new URL(value); return u.protocol === "https:" && !u.username && !u.password ? u.href : ""; } catch { return ""; }
}
