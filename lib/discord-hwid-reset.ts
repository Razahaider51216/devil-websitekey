import { hash } from "./domain";
import { readJson, RequestError } from "./security";

const keyPattern = /^DEVIL-(?:[A-F0-9]{8}-){3}[A-F0-9]{8}$/;
const snowflake = /^\d{17,22}$/;
export const resetSettingId = (keyId: string) => "discord:hwid-reset:" + keyId;
const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { "Cache-Control": "no-store" } });

async function authorized(req: Request, secret: string) {
  const supplied = req.headers.get("authorization")?.match(/^Bearer ([A-Za-z0-9_-]{32,256})$/)?.[1];
  if (secret.length < 32 || !supplied) return false;
  const bytes = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", bytes.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
  const candidate = await crypto.subtle.importKey("raw", bytes.encode(supplied), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const data = bytes.encode("DEVIL-DISCORD-BOT-AUTH:v1");
  return crypto.subtle.verify("HMAC", key, await crypto.subtle.sign("HMAC", candidate, data), data);
}

// Authentication is bot-to-server only. Discord user IDs come from verified gateway interactions.
export async function resetPremiumHwid(req: Request, db: D1Database | undefined, secret: string) {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  if (!await authorized(req, secret)) return json({ error: "unauthorized" }, 401);
  if (!db) return json({ error: "unavailable" }, 503);
  let input: Record<string, unknown>;
  try { input = await readJson(req); }
  catch (error) { return json({ error: "invalid_request" }, error instanceof RequestError ? error.status : 400); }
  const { discordUserId, interactionId } = input;
  const key = typeof input.key === "string" ? input.key.trim() : "";
  if (typeof discordUserId !== "string" || !snowflake.test(discordUserId)
    || typeof interactionId !== "string" || !snowflake.test(interactionId)) return json({ error: "invalid_request" }, 400);
  const now = Date.now(), minute = Math.floor(now / 60_000);
  const rate = await db.prepare(`INSERT INTO rate_limits(id,hits,expires_at) VALUES(?,1,?)
    ON CONFLICT(id) DO UPDATE SET hits=hits+1 RETURNING hits`)
    .bind("discord:reset-attempt:" + discordUserId + ":" + minute, (minute + 2) * 60_000).first<{ hits: number }>();
  if (!rate || rate.hits > 5) return json({ error: "rate_limited", retryAfter: 60 }, 429);
  if (!keyPattern.test(key)) return json({ error: "premium_required" }, 403);
  const row = await db.prepare(`SELECT id,source,owner_id,expires_at,revoked_at FROM access_keys WHERE key_hash=?`)
    .bind(await hash(key)).first<{ id: string; source: string; owner_id: string | null; expires_at: number | null; revoked_at: number | null }>();
  if (!row || row.source !== "admin" || row.revoked_at !== null || row.expires_at !== null && row.expires_at <= now
    || row.owner_id !== null && row.owner_id !== discordUserId) return json({ error: "premium_required" }, 403);
  const id = resetSettingId(row.id);
  const previous = await db.prepare("SELECT value,updated_at FROM site_settings WHERE id=?").bind(id).first<{ value: string; updated_at: number }>();
  if (previous) {
    const data = JSON.parse(previous.value) as { interactionId?: string };
    if (data.interactionId === interactionId) return json({ ok: true, status: "already_processed" });
    if (previous.updated_at > now - 300_000) return json({ error: "cooldown", retryAfter: Math.ceil((previous.updated_at + 300_000 - now) / 1000) }, 429);
  }
  const binding = await db.prepare("SELECT hwid_hash FROM key_devices WHERE key_id=?").bind(row.id).first();
  if (!binding) return json({ ok: true, status: "already_unbound" });

  // D1 batch is transactional. changes() gates deletion on this request winning the
  // cooldown claim, including concurrent requests and duplicate interaction replays.
  const result = await db.batch([
    db.prepare(`INSERT INTO site_settings(id,value,updated_at)
      SELECT ?,json_object('interactionId',?,'actorId',?,'blockedHwidHash',
        (SELECT hwid_hash FROM key_devices WHERE key_id=?),'blockedUntil',?),?
      WHERE EXISTS(SELECT 1 FROM access_keys WHERE id=? AND source='admin' AND revoked_at IS NULL
        AND (expires_at IS NULL OR expires_at>?) AND (owner_id IS NULL OR owner_id=?))
      ON CONFLICT(id) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at
        WHERE site_settings.updated_at<=?`)
      .bind(id, interactionId, discordUserId, row.id, now + 600_000, now, row.id, now, discordUserId, now - 300_000),
    db.prepare(`DELETE FROM key_devices WHERE key_id=? AND changes()>0
      AND EXISTS(SELECT 1 FROM site_settings WHERE id=? AND json_extract(value,'$.interactionId')=?)`)
      .bind(row.id, id, interactionId),
  ]);
  if (result.some(item => !item.success)) throw new Error("Discord reset transaction failed");
  if (!result[0].meta.changes) return json({ error: "reset_not_available", retryAfter: 300 }, 409);
  return json({ ok: true, status: "reset" });
}
