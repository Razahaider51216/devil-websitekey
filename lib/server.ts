import { env } from "cloudflare:workers";
import { getDb } from "../db";
import { flows, steps, keys, limits, siteSettings, keyDevices, flowVerifications } from "../db/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { expiry, hash, keyFor, safeLink, status, stepState, WAIT_MS, type Duration } from "./domain";
import { validateLinks, type Links } from "./settings";
import { verifyTurnstile } from "./turnstile";
import { readJson, cookieValue, requireOrigin } from "./security";
import { discordRequired, requireDiscord, requireDiscordAdmin, flowOwner, flowOwnerCookie, handleDiscord } from "./discord-auth";

export const vars = () => env as unknown as Record<string, string>;
export class HttpError extends Error { code: number; constructor(code: number, message: string) { super(message); this.code = code; } }
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
  requireOrigin(req);
}
export async function body(req: Request) {
  return await readJson(req) as { step: number; key: string; hwid: string; links: unknown; kind: Duration["kind"]; amount: number; label: unknown; token: unknown };
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
  await requireDiscordAdmin(req);
  const secret = vars().ADMIN_ACCESS_KEY;
  if (!secret) fail(503, "ยังไม่ได้ตั้งรหัสแอดมิน");
  if (secret.length < 24) fail(503, "รหัสแอดมินต้องยาวอย่างน้อย 24 ตัวอักษร");
  const provided = req.headers.get("authorization")?.replace(/^Bearer /, "") || "";
  const a = await hash(secret), b = await hash(provided);
  let difference = 0; for (let i = 0; i < a.length; i++) difference |= a.charCodeAt(i) ^ b.charCodeAt(i);
  if (difference) fail(401, "รหัสแอดมินไม่ถูกต้อง");
}
export async function flow(req: Request, create = false) {
  const user = await requireDiscord(req);
  const db = getDb(), now = Date.now();
  const candidate = cookieValue(req, "devil_flow");
  const cookie = candidate && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(candidate) ? candidate : undefined;
  const owned = !user || (cookie && await flowOwner(req, cookie, user.id));
  let row = cookie && owned ? await db.select().from(flows).where(eq(flows.id, cookie)).get() : undefined;
  let fresh = false;
  if (!row || row.expiresAt <= now) {
    if (!create) fail(401, "เซสชันหมดอายุ กรุณาเริ่มขั้นตอนใหม่");
    await rate(req, "new-flow", 20);
    row = { id: crypto.randomUUID(), createdAt: now, expiresAt: now + 86_400_000 };
    await db.insert(flows).values(row); fresh = true;
  }
  const cookies = fresh ? [`devil_flow=${row.id}; HttpOnly; SameSite=Lax; Path=/; Max-Age=86400${new URL(req.url).protocol === "https:" ? "; Secure" : ""}`] : [];
  if (fresh && user) cookies.push(await flowOwnerCookie(req, row.id, user.id));
  return { row, cookies };
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
  const enabled = vars().REQUIRE_TURNSTILE === "1" || discordRequired() || !!(siteKey || secret);
  const verified = enabled ? await db.select().from(flowVerifications).where(eq(flowVerifications.flowId, id)).get() : null;
  const completedAt = Math.max(...rows.filter(r => r.returnedAt !== null).map(r => r.returnedAt! + WAIT_MS), 0);
  const passed = !!verified && verified.verifiedAt >= completedAt && verified.verifiedAt > now - 300_000;
  return { serverNow: now, lifetimeHours: conf.lifetimeHours, steps: result,
    configurationUpdatedAt: conf.updatedAt,
    turnstile: { enabled, configured: !!(siteKey && secret), siteKey, challenge: await hash("turnstile:" + id), passed },
    canClaim: result.every(s => s.status === "done") && (!enabled || (!!siteKey && !!secret && passed)), key: issued ? await presentKey(issued) : null };
}
export async function presentKey(row: typeof keys.$inferSelect) {
  return { id: row.id, key: await keyFor(row.id, vars().KEY_SECRET || ""), label: row.label, source: row.source, createdAt: row.createdAt, expiresAt: row.expiresAt, status: status(row, Date.now()), kind: row.durationKind, amount: row.durationAmount };
}
export async function handle(req: Request, path: string[]) {
  if (vars().KEY_MAINTENANCE === "1") return json({ error: "Database migration in progress. Please try again shortly." }, 503, { "Retry-After": "60" });
  const db = getDb(), now = Date.now(), route = path.join("/");
  if (route.startsWith("auth/")) return handleDiscord(req, route, rate);
  if (route === "flow" && req.method === "GET") {
    await rate(req, "flow-state", 600);
    const session = await flow(req, true);
    const response = json(await state(session.row.id));
    for (const value of session.cookies) response.headers.append("Set-Cookie", value);
    return response;
  }
  if ((route === "flow/open" || route === "flow/return") && req.method === "POST") {
    sameOrigin(req); const { step } = await body(req), session = await flow(req);
    await rate(req, "steps", 600); await rate(req, "step-flow:" + session.row.id, 30);
    if (!Number.isInteger(step) || step < 1 || step > 4) fail(400, "ไม่พบขั้นตอน");
    const current = await state(session.row.id);
    if (current.key) fail(409, "เซสชันนี้ได้รับคีย์แล้ว");
    if (!current.steps.slice(0, step - 1).every(s => s.status === "done")) fail(409, "กรุณาทำขั้นตอนก่อนหน้าให้ครบ");
    const selected = current.steps[step - 1]; if (!selected.url) fail(503, "แอดมินยังไม่ได้ตั้งลิงก์ขั้นตอนนี้");
    const id = `${session.row.id}:${step}`;
    const mutationTime = Date.now();
    if (route.endsWith("open")) {
      await db.insert(steps).values({ id, flowId: session.row.id, number: step, openedAt: mutationTime, returnedAt: null, linkHash: await hash(selected.url) }).onConflictDoNothing();
      const existing = await db.select().from(steps).where(eq(steps.id, id)).get();
      if (existing!.linkHash !== await hash(selected.url)) await db.update(steps).set({ openedAt: mutationTime, returnedAt: null, linkHash: await hash(selected.url) }).where(eq(steps.id, id));
    } else {
      const existing = await db.select().from(steps).where(eq(steps.id, id)).get();
      if (!existing?.openedAt || existing.linkHash !== await hash(selected.url)) fail(409, "เปิดลิงก์ขั้นตอนนี้ก่อน");
      await db.update(steps).set({ returnedAt: sql`case when ${steps.returnedAt} < ${steps.openedAt} then ${mutationTime} else coalesce(${steps.returnedAt}, ${mutationTime}) end` }).where(and(eq(steps.id, id), eq(steps.linkHash, await hash(selected.url))));
    }
    return json({ ...await state(session.row.id), openedUrl: selected.url });
  }
  if (route === "flow/claim" && req.method === "POST") {
    sameOrigin(req); await body(req); await rate(req, "claim", 120); const session = await flow(req);
    const current = await state(session.row.id);
    if (current.key) return json(current.key);
    if (!current.canClaim) {
      if (current.steps.every(s => s.status === "done") && current.turnstile.enabled) fail(409, "กรุณายืนยันว่าไม่ใช่บอทอีกครั้ง");
      fail(409, "กรุณาทำครบ 4 ขั้นตอนและรอคูลดาวน์");
    }
    const id = crypto.randomUUID(), key = await keyFor(id, vars().KEY_SECRET || "");
    const issuedAt = Date.now();
    const checks = await Promise.all(current.steps.map(async s => sql`exists (select 1 from steps where flow_id=${session.row.id} and number=${s.number} and id=${session.row.id + ":" + s.number} and link_hash=${await hash(s.url)} and opened_at is not null and returned_at >= opened_at and returned_at <= ${issuedAt - WAIT_MS})`));
    const human = current.turnstile.enabled ? sql`exists (select 1 from flow_verifications where flow_id=${session.row.id} and verified_at > ${issuedAt - 300_000} and verified_at >= (select max(returned_at) + ${WAIT_MS} from steps where flow_id=${session.row.id}))` : sql`1=1`;
    // Eligibility and unique issuance are checked by the same database statement.
    await db.run(sql`insert into access_keys (id,flow_id,key_hash,label,source,created_at,expires_at,revoked_at,duration_kind,duration_amount)
      select ${id},${session.row.id},${await hash(key)},'Standard access','steps',${issuedAt},${issuedAt + current.lifetimeHours * 3_600_000},null,'hours',${current.lifetimeHours}
      where exists (select 1 from flows where id=${session.row.id} and expires_at > ${issuedAt})
      and coalesce((select updated_at from site_settings where id='links'),0)=${current.configurationUpdatedAt ?? 0}
      and ${sql.join(checks, sql` and `)} and ${human} on conflict(flow_id) do nothing`);
    const row = await db.select().from(keys).where(eq(keys.flowId, session.row.id)).get();
    if (!row) fail(409, "Steps or verification changed. Please reload and try again.");
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
    const verifiedAt = Date.now();
    await db.insert(flowVerifications).values({ flowId: session.row.id, verifiedAt }).onConflictDoUpdate({ target: flowVerifications.flowId, set: { verifiedAt } });
    return json(await state(session.row.id));
  }
  if (route === "validate" && req.method === "POST") {
    const input = await body(req);
    if (typeof input.key !== "string" || input.key.length > 100) fail(400, "รูปแบบคีย์ไม่ถูกต้อง");
    if (!/^DEVIL-(?:[A-F0-9]{8}-){3}[A-F0-9]{8}$/.test(input.key.trim())) return json({ valid: false, status: "invalid", expiresAt: null });
    await rate(req, "validate", 600); await rate(req, "validate-key:" + await hash(input.key.trim()), 30);
    const row = await db.select().from(keys).where(eq(keys.keyHash, await hash(input.key.trim()))).get();
    const keyStatus = row ? status(row, Date.now()) : "invalid";
    if (!row || keyStatus !== "active") return json({ valid: false, status: keyStatus, expiresAt: row?.expiresAt ?? null });
    if (typeof input.hwid !== "string" || input.hwid.trim().length < 8 || input.hwid.length > 512) {
      return json({ valid: false, status: "hwid_required", expiresAt: row.expiresAt });
    }
    const hwidHash = await hash("DEVIL-HWID:v1:" + input.hwid.trim());
    // A primary key makes simultaneous first-use requests compete for exactly one binding.
    let binding = await db.select().from(keyDevices).where(eq(keyDevices.keyId, row.id)).get();
    if (!binding) {
      await db.insert(keyDevices).values({ keyId: row.id, hwidHash, boundAt: Date.now() }).onConflictDoNothing();
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
      const updatedAt = Date.now();
      await db.insert(siteSettings).values({ id: "links", value: JSON.stringify(links), updatedAt })
        .onConflictDoUpdate({ target: siteSettings.id, set: { value: JSON.stringify(links), updatedAt } });
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
      const createdAt = Date.now();
      let ends; try { ends = expiry(createdAt, duration); } catch (e) { fail(400, (e as Error).message); }
      const id = crypto.randomUUID(), key = await keyFor(id, vars().KEY_SECRET || "");
      const row = { id, flowId: null, keyHash: await hash(key), label: String(input.label || "Admin key").slice(0, 80), source: "admin", createdAt, expiresAt: ends, revokedAt: null, durationKind: duration.kind, durationAmount: duration.kind === "permanent" ? 0 : duration.amount };
      await db.insert(keys).values(row); return json(await presentKey(row), 201);
    }
    if (path[1] === "keys" && path.length === 3 && req.method === "DELETE") {
      const result = await db.update(keys).set({ revokedAt: now }).where(eq(keys.id, path[2])).returning({ id: keys.id });
      if (!result.length) fail(404, "ไม่พบคีย์"); return json({ ok: true });
    }
  }
  fail(404, "ไม่พบรายการที่ต้องการ");
}
