import { env } from "cloudflare:workers";
import { getDb } from "../db";
import { flows, steps, keys, limits, siteSettings, keyDevices, flowVerifications } from "../db/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { expiry, hash, keyFor, safeLink, status, stepState, WAIT_MS, type Duration } from "./domain";
import { validateLinks, type Links } from "./settings";
import { verifyTurnstile } from "./turnstile";

export const vars = () => env as unknown as Record<string, string>;
export class HttpError extends Error { constructor(public code: number, message: string) { super(message); } }
export function fail(code: number, message: string): never { throw new HttpError(code, message); }
export function json(value: unknown, code = 200, extra: Record<string,string> = {}) {
  return Response.json(value, { status: code, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", ...extra } });
}
export async function config() {
  const v = vars();
  const stored = await getDb().select().from(siteSettings).where(eq(siteSettings.id, "links")).get();
  const links: Links = stored ? validateLinks(JSON.parse(stored.value)) : {
    discordUrl: safeLink(v.DISCORD_URL || "https://discord.gg/fDwPCmpkkh"),
    channelUrl: safeLink(v.YOUTUBE_CHANNEL_URL || ""), videoUrl: safeLink(v.YOUTUBE_VIDEO_URL || ""),
    commentUrl: safeLink(v.COMMENT_VIDEO_URL || ""), likeUrl: safeLink(v.LIKE_VIDEO_URL || ""),
  };
  return { links, updatedAt: stored?.updatedAt ?? null, lifetimeHours: Math.max(1, Math.min(8760, Number(v.PUBLIC_KEY_HOURS) || 24)), steps: [
    { number: 1, title: "เข้าร่วม Discord", subtitle: "เข้ามาเป็นส่วนหนึ่งของ DEVIL community", service: "DISCORD", url: links.discordUrl },
    { number: 2, title: "ติดตามช่อง DEVIL HUB", subtitle: "อัปเดตสคริปต์และฟีเจอร์ใหม่ก่อนใคร", service: "YOUTUBE", url: links.channelUrl },
    { number: 3, title: "คอมเมนต์วิดีโอล่าสุด", subtitle: "แวะไปทักทายกันใต้คลิปวิดีโอ", service: "COMMENT", url: links.commentUrl || links.videoUrl },
    { number: 4, title: "กดไลค์วิดีโอ", subtitle: "ส่งกำลังใจให้ DEVIL HUB ด้วยหนึ่งไลค์", service: "LIKE", url: links.likeUrl || links.videoUrl },
  ] };
}
export function sameOrigin(req: Request) {
  if (req.headers.get("origin") !== new URL(req.url).origin) fail(403, "กรุณาทำรายการจากหน้า DEVIL KEY");
}
export async function body(req: Request) {
  if (!req.headers.get("content-type")?.includes("application/json")) fail(415, "ต้องส่งข้อมูลแบบ JSON");
  if (Number(req.headers.get("content-length")) > 16384) fail(413, "ข้อมูลยาวเกินไป");
  const text = await req.text(); if (text.length > 16384) fail(413, "ข้อมูลยาวเกินไป");
  try { const value = JSON.parse(text); if (!value || Array.isArray(value) || typeof value !== "object") throw 0; return value; } catch { fail(400, "ข้อมูลไม่ถูกต้อง"); }
}
export async function rate(req: Request, kind: string, maximum: number) {
  const now = Date.now(), bucket = Math.floor(now / 60_000);
  const ip = req.headers.get("cf-connecting-ip") || "local";
  const id = await hash(`${kind}:${ip}:${bucket}`);
  const db = getDb();
  const record = await db.insert(limits).values({ id, hits: 1, expiresAt: (bucket + 2) * 60_000 })
    .onConflictDoUpdate({ target: limits.id, set: { hits: sql`${limits.hits} + 1` } }).returning({ hits: limits.hits }).get();
  if (record!.hits > maximum) fail(429, "ทำรายการถี่เกินไป กรุณารอสักครู่");
  if (Math.random() < .02) await db.delete(limits).where(sql`${limits.expiresAt} < ${now}`);
}
export async function admin(req: Request) {
  await rate(req, "admin", 60);
  const secret = vars().ADMIN_ACCESS_KEY;
  if (!secret) fail(503, "ยังไม่ได้ตั้งรหัสแอดมิน");
  if (secret.length < 24) fail(503, "รหัสแอดมินต้องยาวอย่างน้อย 24 ตัวอักษร");
  const provided = req.headers.get("authorization")?.replace(/^Bearer /, "") || "";
  const a = await hash(secret), b = await hash(provided);
  let difference = 0; for (let i = 0; i < a.length; i++) difference |= a.charCodeAt(i) ^ b.charCodeAt(i);
  if (difference) fail(401, "รหัสแอดมินไม่ถูกต้อง");
}
export async function flow(req: Request, create = false) {
  const db = getDb(), now = Date.now();
  const cookie = req.headers.get("cookie")?.match(/(?:^|;\s*)devil_flow=([a-f0-9-]{36})(?:;|$)/)?.[1];
  let row = cookie ? await db.select().from(flows).where(eq(flows.id, cookie)).get() : undefined;
  let fresh = false;
  if (!row || row.expiresAt <= now) {
    if (!create) fail(401, "เซสชันหมดอายุ กรุณาเริ่มขั้นตอนใหม่");
    await rate(req, "new-flow", 20);
    row = { id: crypto.randomUUID(), createdAt: now, expiresAt: now + 86_400_000 };
    await db.insert(flows).values(row); fresh = true;
  }
  return { row, cookie: fresh ? `devil_flow=${row.id}; HttpOnly; SameSite=Lax; Path=/; Max-Age=86400${new URL(req.url).protocol === "https:" ? "; Secure" : ""}` : undefined };
}
export async function state(id: string) {
  const db = getDb(), conf = await config(), now = Date.now();
  const rows = await db.select().from(steps).where(eq(steps.flowId, id));
  const issued = await db.select().from(keys).where(eq(keys.flowId, id)).get();
  const result = [];
  for (const s of conf.steps) {
    const row = rows.find(r => r.number === s.number);
    const valid = !!row && row.linkHash === await hash(s.url);
    const step = valid ? row : { openedAt: null, returnedAt: null };
    result.push({ ...s, configured: !!s.url, status: stepState(step, now), deadline: step.returnedAt === null ? null : step.returnedAt + WAIT_MS });
  }
  const siteKey = vars().TURNSTILE_SITE_KEY || "", secret = vars().TURNSTILE_SECRET_KEY || "";
  const enabled = !!(siteKey || secret);
  const verified = enabled ? await db.select().from(flowVerifications).where(eq(flowVerifications.flowId, id)).get() : null;
  return { serverNow: now, lifetimeHours: conf.lifetimeHours, steps: result,
    turnstile: { enabled, configured: !!(siteKey && secret), siteKey, challenge: await hash("turnstile:" + id), passed: !!verified },
    canClaim: result.every(s => s.status === "done") && (!enabled || !!verified), key: issued ? await presentKey(issued) : null };
}
export async function presentKey(row: typeof keys.$inferSelect) {
  return { id: row.id, key: await keyFor(row.id, vars().KEY_SECRET || ""), label: row.label, source: row.source, createdAt: row.createdAt, expiresAt: row.expiresAt, status: status(row, Date.now()), kind: row.durationKind, amount: row.durationAmount };
}
export async function handle(req: Request, path: string[]) {
  const db = getDb(), now = Date.now(), route = path.join("/");
  if (route === "flow" && req.method === "GET") {
    const session = await flow(req, true);
    return json(await state(session.row.id), 200, session.cookie ? { "Set-Cookie": session.cookie } : {});
  }
  if ((route === "flow/open" || route === "flow/return") && req.method === "POST") {
    sameOrigin(req); const { step } = await body(req), session = await flow(req);
    if (!Number.isInteger(step) || step < 1 || step > 4) fail(400, "ไม่พบขั้นตอน");
    const current = await state(session.row.id);
    if (current.key) fail(409, "เซสชันนี้ได้รับคีย์แล้ว");
    if (!current.steps.slice(0, step - 1).every(s => s.status === "done")) fail(409, "กรุณาทำขั้นตอนก่อนหน้าให้ครบ");
    const selected = current.steps[step - 1]; if (!selected.url) fail(503, "แอดมินยังไม่ได้ตั้งลิงก์ขั้นตอนนี้");
    const id = `${session.row.id}:${step}`;
    if (route.endsWith("open")) {
      await db.insert(steps).values({ id, flowId: session.row.id, number: step, openedAt: now, returnedAt: null, linkHash: await hash(selected.url) }).onConflictDoNothing();
      const existing = await db.select().from(steps).where(eq(steps.id, id)).get();
      if (existing!.linkHash !== await hash(selected.url)) await db.update(steps).set({ openedAt: now, returnedAt: null, linkHash: await hash(selected.url) }).where(eq(steps.id, id));
    } else {
      const existing = await db.select().from(steps).where(eq(steps.id, id)).get();
      if (!existing?.openedAt || existing.linkHash !== await hash(selected.url)) fail(409, "เปิดลิงก์ขั้นตอนนี้ก่อน");
      await db.update(steps).set({ returnedAt: sql`coalesce(${steps.returnedAt}, ${now})` }).where(eq(steps.id, id));
    }
    return json({ ...await state(session.row.id), openedUrl: selected.url });
  }
  if (route === "flow/claim" && req.method === "POST") {
    sameOrigin(req); await rate(req, "claim", 20); const session = await flow(req);
    const current = await state(session.row.id);
    if (current.key) return json(current.key);
    if (!current.canClaim) {
      if (current.steps.every(s => s.status === "done") && current.turnstile.enabled) fail(409, "กรุณายืนยันว่าไม่ใช่บอทอีกครั้ง");
      fail(409, "กรุณาทำครบ 4 ขั้นตอนและรอคูลดาวน์");
    }
    const id = crypto.randomUUID(), key = await keyFor(id, vars().KEY_SECRET || "");
    await db.insert(keys).values({ id, flowId: session.row.id, keyHash: await hash(key), label: "Standard access", source: "steps", createdAt: now, expiresAt: now + current.lifetimeHours * 3_600_000, durationKind: "hours", durationAmount: current.lifetimeHours, revokedAt: null }).onConflictDoNothing();
    const row = await db.select().from(keys).where(eq(keys.flowId, session.row.id)).get();
    return json(await presentKey(row!));
  }
  if (route === "flow/verify" && req.method === "POST") {
    sameOrigin(req); await rate(req, "turnstile", 15);
    const session = await flow(req), current = await state(session.row.id);
    if (!current.turnstile.enabled || !current.turnstile.configured) fail(503, "ยังไม่ได้ตั้งค่าระบบยืนยันว่าไม่ใช่บอท");
    if (!current.steps.every(s => s.status === "done")) fail(409, "กรุณาทำขั้นตอนก่อนหน้าให้ครบ");
    if (current.turnstile.passed || current.key) return json(current);
    const { token } = await body(req);
    let valid = false;
    try { valid = await verifyTurnstile(vars().TURNSTILE_SECRET_KEY, token, new URL(req.url).hostname, current.turnstile.challenge); }
    catch { fail(503, "ติดต่อระบบยืนยันไม่สำเร็จ กรุณาลองอีกครั้ง"); }
    if (!valid) fail(400, "กรุณายืนยันว่าไม่ใช่บอทอีกครั้ง");
    await db.insert(flowVerifications).values({ flowId: session.row.id, verifiedAt: now }).onConflictDoNothing();
    return json(await state(session.row.id));
  }
  if (route === "validate" && req.method === "POST") {
    await rate(req, "validate", 60); const input = await body(req);
    if (typeof input.key !== "string" || input.key.length > 100) fail(400, "รูปแบบคีย์ไม่ถูกต้อง");
    const row = await db.select().from(keys).where(eq(keys.keyHash, await hash(input.key.trim()))).get();
    const keyStatus = row ? status(row, now) : "invalid";
    if (!row || keyStatus !== "active") return json({ valid: false, status: keyStatus, expiresAt: row?.expiresAt ?? null });
    if (typeof input.hwid !== "string" || input.hwid.trim().length < 8 || input.hwid.length > 512) {
      return json({ valid: false, status: "hwid_required", expiresAt: row.expiresAt });
    }
    const hwidHash = await hash("DEVIL-HWID:v1:" + input.hwid.trim());
    // A primary key makes simultaneous first-use requests compete for exactly one binding.
    let binding = await db.select().from(keyDevices).where(eq(keyDevices.keyId, row.id)).get();
    if (!binding) {
      await db.insert(keyDevices).values({ keyId: row.id, hwidHash, boundAt: now }).onConflictDoNothing();
      binding = await db.select().from(keyDevices).where(eq(keyDevices.keyId, row.id)).get();
    }
    const matched = binding?.hwidHash === hwidHash;
    return json({ valid: matched, status: matched ? "active" : "hwid_mismatch", expiresAt: row.expiresAt });
  }
  if (route.startsWith("admin")) {
    await admin(req);
    if (req.method !== "GET") sameOrigin(req);
    if (route === "admin/settings" && req.method === "GET") return json(await config());
    if (route === "admin/settings" && req.method === "POST") {
      const input = await body(req);
      let links: Links;
      try { links = validateLinks(input.links); } catch (error) { fail(400, (error as Error).message); }
      await db.insert(siteSettings).values({ id: "links", value: JSON.stringify(links), updatedAt: now })
        .onConflictDoUpdate({ target: siteSettings.id, set: { value: JSON.stringify(links), updatedAt: now } });
      return json(await config());
    }
    if (route === "admin/keys" && req.method === "GET") {
      const rows = await db.select().from(keys).orderBy(desc(keys.createdAt)).limit(200);
      const totals = await db.select({ total: sql<number>`count(*)`, active: sql<number>`sum(case when revoked_at is null and (expires_at is null or expires_at > ${now}) then 1 else 0 end)`, permanent: sql<number>`sum(case when expires_at is null and revoked_at is null then 1 else 0 end)`, revoked: sql<number>`sum(case when revoked_at is not null then 1 else 0 end)` }).from(keys).get();
      return json({ serverNow: now, keys: await Promise.all(rows.map(presentKey)), stats: totals, configuration: await config() });
    }
    if (route === "admin/keys" && req.method === "POST") {
      const input = await body(req); const duration: Duration = { kind: input.kind, amount: input.amount };
      if (!["permanent", "days", "months"].includes(duration.kind)) fail(400, "เลือกรูปแบบอายุคีย์");
      let ends; try { ends = expiry(now, duration); } catch (e) { fail(400, (e as Error).message); }
      const id = crypto.randomUUID(), key = await keyFor(id, vars().KEY_SECRET || "");
      const row = { id, flowId: null, keyHash: await hash(key), label: String(input.label || "Admin key").slice(0, 80), source: "admin", createdAt: now, expiresAt: ends, revokedAt: null, durationKind: duration.kind, durationAmount: duration.kind === "permanent" ? 0 : duration.amount };
      await db.insert(keys).values(row); return json(await presentKey(row), 201);
    }
    if (path[1] === "keys" && path.length === 3 && req.method === "DELETE") {
      const result = await db.update(keys).set({ revokedAt: now }).where(eq(keys.id, path[2])).returning({ id: keys.id });
      if (!result.length) fail(404, "ไม่พบคีย์"); return json({ ok: true });
    }
  }
  fail(404, "ไม่พบรายการที่ต้องการ");
}
