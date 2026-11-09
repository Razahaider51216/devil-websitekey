import { and, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "../db";
import { scriptLogEvents as events, scriptLogSessions as sessions } from "../db/schema";

export const LOG_OFFLINE_RETENTION_MS = 60 * 60 * 1000;

// A connected session in any supported game keeps this account's feed alive.
// Both deletes run in one D1 transaction so an incoming heartbeat cannot race
// between the eligibility check and deletion. Personal ingest links are retained.
export async function clearExpiredScriptLogs(ownerId?: string, now = Date.now()) {
  const db = getDb();
  const expired = db.select({ ownerId: sessions.ownerId }).from(sessions)
    .where(ownerId ? eq(sessions.ownerId, ownerId) : undefined)
    .groupBy(sessions.ownerId)
    .having(sql`max(${sessions.lastSeenAt}) < ${now - LOG_OFFLINE_RETENTION_MS}`);
  await db.batch([
    db.delete(events).where(inArray(events.ownerId, expired)),
    db.delete(sessions).where(inArray(sessions.ownerId, expired)),
  ]);
}
