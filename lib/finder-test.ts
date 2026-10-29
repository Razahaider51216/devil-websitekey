import { env } from "cloudflare:workers";
import { and, eq, gte, lt } from "drizzle-orm";
import { getDb } from "../db";
import { keys, keyDevices, siteSettings } from "../db/schema";
import { hash, status } from "./domain";
import { readJson, RequestError, requireOrigin, seal, unseal } from "./security";

const PLACE = 107778070777162, TTL = 120_000;
const prefix = "finder-test:";
const secret = () => (env as unknown as { KEY_SECRET: string }).KEY_SECRET;
type Egg = { uid: string; name: string; rarity: string; income: number; scale: number; mutation: string };
type Deps = { rate: (req: Request, kind: string, max: number) => Promise<void>; validate: (req: Request, input: Record<string, unknown>) => Promise<Response> };
const json = (data: unknown) => Response.json(data, { headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
const bad = (code: number, message: string): never => { throw new RequestError(code, message); };
const range = () => and(gte(siteSettings.id, prefix), lt(siteSettings.id, "finder-test;"));
function text(value: unknown, max: number, empty = false) {
  if (typeof value !== "string" || (!empty && !value.trim()) || value.length > max || /[\x00-\x1f\x7f]/.test(value)) return bad(400, "Invalid Finder text");
  return value;
}
function numeric(value: unknown, maximum: number) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= maximum ? value : bad(400, "Invalid Finder number");
}
export function finderEggs(value: unknown): Egg[] {
  if (!Array.isArray(value) || value.length > 25) return bad(400, "Send at most 25 eggs");
  const seen = new Set();
  return value.map(e => {
    if (!e || typeof e !== "object") return bad(400, "Invalid Finder egg");
    const uid = text(e.uid, 150);
    if (seen.has(uid)) return bad(400, "Duplicate Finder egg"); seen.add(uid);
    return { uid, name: text(e.name, 80), rarity: text(e.rarity, 32), income: numeric(e.income, 1e30), scale: numeric(e.scale, 1e9), mutation: text(e.mutation, 100, true) };
  });
}
export async function handleFinderTest(req: Request, path: string[], deps: Deps) {
  if (req.method !== "POST") return bad(405, "Use POST for the Finder test");
  if (req.headers.has("origin")) requireOrigin(req);
  const action = path.join("/");
  if (!["finder-test/session", "finder-test/report", "finder-test/feed"].includes(action)) return bad(404, "Not found");
  await deps.rate(req, action, action.endsWith("session") ? 10 : 12);
  const input = await readJson(req), db = getDb(), now = Date.now();
  if (action.endsWith("session")) {
    if (input.placeId !== PLACE || typeof input.jobId !== "string" || !/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(input.jobId)) return bad(400, "Join a public Steal An Egg server first");
    const checked = await deps.validate(req, { key: input.key, hwid: input.hwid });
    if (!checked.ok) return checked;
    const verdict = await checked.json() as { valid: boolean };
    if (!verdict.valid) return bad(403, "A valid premium key is required");
    const keyHash = await hash(String(input.key).trim());
    const row = await db.select().from(keys).where(eq(keys.keyHash, keyHash)).get();
    if (!row || row.source !== "admin" || status(row, now) !== "active") return bad(403, "Finder test requires a key created by an admin");
    const hwidHash = await hash("DEVIL-HWID:v1:" + String(input.hwid).trim());
    return json({ token: await seal({ keyHash, hwidHash, jobId: input.jobId.toLowerCase() }, "finder-test", secret(), 900_000), expiresAt: now + 900_000, ttlSeconds: TTL / 1000 });
  }
  if (typeof input.token !== "string" || input.token.length > 4096) return bad(401, "Finder session required");
  const auth = await unseal(input.token, "finder-test", secret());
  if (!auth || typeof auth.keyHash !== "string" || typeof auth.hwidHash !== "string" || typeof auth.jobId !== "string") return bad(401, "Finder session expired");
  const row = await db.select().from(keys).where(eq(keys.keyHash, auth.keyHash)).get();
  if (!row || row.source !== "admin" || status(row, now) !== "active") return bad(403, "Premium key expired or revoked");
  const device = await db.select().from(keyDevices).where(eq(keyDevices.keyId, row.id)).get();
  if (!device || device.hwidHash !== auth.hwidHash) return bad(403, "Device binding changed");
  if (action.endsWith("report")) {
    await deps.rate(req, "finder-test-report-key:" + row.id, 4);
    const eggs = finderEggs(input.eggs);
    await db.delete(siteSettings).where(and(range(), lt(siteSettings.updatedAt, now - TTL)));
    const id = prefix + auth.jobId;
    const existing = await db.select({ id: siteSettings.id }).from(siteSettings).where(eq(siteSettings.id, id)).get();
    if (!existing && (await db.select({ id: siteSettings.id }).from(siteSettings).where(range()).limit(201)).length >= 200) return bad(503, "Finder test server capacity reached");
    const value = JSON.stringify({ jobId: auth.jobId, placeId: PLACE, eggs });
    await db.insert(siteSettings).values({ id, value, updatedAt: now }).onConflictDoUpdate({ target: siteSettings.id, set: { value, updatedAt: now } });
    return json({ accepted: eggs.length, expiresAt: now + TTL });
  }
  const minimum = input.minimum === undefined ? 0 : numeric(input.minimum, 1e30);
  const rarity = input.rarity === undefined ? "" : text(input.rarity, 32, true);
  const query = input.query === undefined ? "" : text(input.query, 80, true).toLowerCase();
  const servers = await db.select().from(siteSettings).where(and(range(), gte(siteSettings.updatedAt, now - TTL))).limit(200);
  const entries = servers.flatMap(server => {
    const data = JSON.parse(server.value) as { jobId: string; placeId: number; eggs: Egg[] };
    return data.eggs.filter(e => e.income >= minimum && (!rarity || e.rarity === rarity) && (!query || (e.name + " " + e.mutation).toLowerCase().includes(query)))
      .map(e => ({ ...e, jobId: data.jobId, placeId: PLACE, seenAt: server.updatedAt, expiresAt: server.updatedAt + TTL }));
  }).sort((a, b) => b.income - a.income).slice(0, 100);
  return json({ entries, servers: servers.length, serverNow: now, source: "DEVIL test client reports; not independently verified", ttlSeconds: TTL / 1000 });
}
