import { getDb } from "../db";
import { keys } from "../db/schema";
import { and, eq, inArray, sql } from "drizzle-orm";

export async function activePremium(ownerId: string | null | undefined, now = Date.now()) {
  if (!ownerId) return undefined;
  return getDb().select().from(keys).where(and(eq(keys.ownerId, ownerId), inArray(keys.source, ["purchase", "admin"]),
    sql`${keys.revokedAt} is null`, sql`(${keys.expiresAt} is null or ${keys.expiresAt}>${now})`))
    .orderBy(sql`${keys.expiresAt} is null desc`, sql`${keys.expiresAt} desc`, sql`${keys.createdAt} desc`).get();
}

export async function retireOwnedFree(ownerId: string | null | undefined, now = Date.now()) {
  if (!ownerId) return;
  // Recheck entitlement in this write so an expired/revoked Premium cannot retire Free.
  await getDb().run(sql`UPDATE access_keys SET expires_at=${now}
    WHERE owner_id=${ownerId} AND source='steps' AND revoked_at IS NULL
    AND (expires_at IS NULL OR expires_at>${now})
    AND EXISTS(SELECT 1 FROM access_keys premium WHERE premium.owner_id=${ownerId}
      AND premium.source IN ('purchase','admin') AND premium.revoked_at IS NULL
      AND (premium.expires_at IS NULL OR premium.expires_at>${now}))`);
}
