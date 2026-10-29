import { inArray, sql } from "drizzle-orm";
import { getDb } from "../db";
import { limits, siteSettings } from "../db/schema";
import { hash } from "./domain";
import { defaultGames } from "./supported-games.seed";
import type { SupportedGame } from "./supported-games";

const prefix = "game-launches:";
const windowMs = 5 * 60_000;
function knownGame(gameId: unknown, placeId: unknown) {
  const universe = Number.isSafeInteger(gameId) && Number(gameId) > 0 ? Number(gameId) : null;
  const place = Number.isSafeInteger(placeId) && Number(placeId) > 0 ? Number(placeId) : null;
  const byUniverse = defaultGames.find(game => game.universeId === universe);
  const byPlace = defaultGames.find(game => game.placeId === place);
  if (byUniverse && byPlace && byUniverse.id !== byPlace.id) return undefined;
  if (universe && !byUniverse) return undefined;
  return byUniverse || byPlace;
}

// Call only after Key/HWID validation and successful private-session creation.
// These are authenticated launch counts, not online players or play duration.
export async function recordGameLaunch(input: Record<string, unknown>, keyHash: string, maps: number) {
  const game = knownGame(input.gameId, input.placeId);
  if (!game || game.id === "steal-a-pet-and-ride-it" && maps < 14 || game.id === "throw-food-for-animals" && maps < 13) return;
  const now = Date.now(), bucket = Math.floor(now / windowMs), db = getDb();
  const id = "game-launch:" + await hash(`${keyHash}:${game.universeId}:${bucket}`);
  const claimed = await db.insert(limits).values({ id, hits: 1, expiresAt: (bucket + 2) * windowMs })
    .onConflictDoNothing().returning({ id: limits.id }).get();
  if (!claimed) return;
  await db.insert(siteSettings).values({ id: prefix + game.universeId, value: "1", updatedAt: now })
    .onConflictDoUpdate({ target: siteSettings.id, set: { value: sql`CAST(${siteSettings.value} AS INTEGER) + 1` } });
}

export async function gameUsage(games: SupportedGame[]) {
  const ids = [...new Set(games.map(game => knownGame(game.universeId, game.placeId)?.universeId).filter(Boolean))];
  const rows = ids.length ? await getDb().select().from(siteSettings).where(inArray(siteSettings.id, ids.map(id => prefix + id))) : [];
  const counts = new Map(rows.map(row => [row.id, Math.max(0, Number(row.value) || 0)]));
  return {
    trackingSince: rows.length ? Math.min(...rows.map(row => row.updatedAt)) : null,
    games: games.map(game => ({ ...game, launches: counts.get(prefix + knownGame(game.universeId, game.placeId)?.universeId) || 0 })),
  };
}
