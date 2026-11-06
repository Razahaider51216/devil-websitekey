import { botAuthorized } from "./discord-hwid-reset";
import { hash } from "./domain";
import { readJson } from "./security";

export async function claimPremiumRole(req: Request, db: D1Database | undefined, secret: string) {
  const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  if (!await botAuthorized(req, secret)) return json({ error: "unauthorized" }, 401);
  if (!db) return json({ error: "unavailable" }, 503);
  let input: Record<string, unknown>;
  try { input = await readJson(req); } catch { return json({ error: "invalid_request" }, 400); }
  const actor = input.discordUserId;
  if (typeof actor !== "string" || !/^\d{17,22}$/.test(actor)) return json({ error: "invalid_request" }, 400);
  const now = Date.now(), minute = Math.floor(now / 60000);
  const rate = await db.prepare(`INSERT INTO rate_limits(id,hits,expires_at) VALUES(?,1,?)
    ON CONFLICT(id) DO UPDATE SET hits=hits+1 RETURNING hits`)
    .bind(`discord:premium-role:${actor}:${minute}`, (minute + 2) * 60000).first<{ hits: number }>();
  if (!rate || rate.hits > 5) return json({ error: "rate_limited" }, 429);
  const key = typeof input.key === "string" ? input.key.trim() : "";
  if (!/^DEVIL-(?:[A-F0-9]{8}-){3}[A-F0-9]{8}$/.test(key)) return json({ error: "premium_required" }, 403);
  // Revalidate eligibility in the atomic claim. Google-owned and unassigned keys
  // can link to one Discord account; a Discord-owned key must match its owner.
  const row = await db.prepare(`INSERT INTO site_settings(id,value,updated_at)
    SELECT 'discord:premium-role:'||id,json_object('discordUserId',?),? FROM access_keys
    WHERE key_hash=? AND source IN ('admin','purchase') AND revoked_at IS NULL
      AND (expires_at IS NULL OR expires_at>?)
      AND (owner_id IS NULL OR owner_id LIKE 'google:%' OR owner_id=?)
    ON CONFLICT(id) DO UPDATE SET updated_at=excluded.updated_at
      WHERE json_extract(site_settings.value,'$.discordUserId')=? RETURNING id`)
    .bind(actor, now, await hash(key), now, actor, actor).first<{ id: string }>();
  if (!row) return json({ error: "premium_required" }, 403);
  return json({ ok: true, status: "eligible" });
}
