import { defaultGames } from "./supported-games.seed";

export type SupportedGame = {
  id: string; name: string; imageUrl: string; gameUrl: string; enabled: boolean; sortOrder: number;
  universeId?: number; placeId?: number;
};
export const gamesSettingId = "supported-games";
export function initialGames(): SupportedGame[] { return defaultGames.map(game => ({ ...game })); }
export function orderedGames(games: SupportedGame[], publicOnly = false) {
  return games.filter(game => !publicOnly || game.enabled).sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
}
export function validateGame(input: unknown, id: string, previous?: SupportedGame): SupportedGame {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Invalid game information");
  const record = input as Record<string, unknown>;
  if (!/^[a-z0-9][a-z0-9-]{0,79}$/.test(id)) throw new Error("Invalid game ID");
  const name = typeof record.name === "string" ? record.name.trim() : "";
  if (!name || name.length > 140 || /[\u0000-\u001f\u007f]/.test(name)) throw new Error("Game name is required (maximum 140 characters)");
  if (typeof record.enabled !== "boolean") throw new Error("Invalid game visibility");
  if (!Number.isSafeInteger(record.sortOrder) || (record.sortOrder as number) < 0 || (record.sortOrder as number) > 9999) throw new Error("Invalid display order");
  if (typeof record.gameUrl !== "string" || record.gameUrl.length > 2048) throw new Error("Invalid Roblox game link");
  let link: URL;
  try { link = new URL(record.gameUrl); } catch { throw new Error("Use a Roblox game link"); }
  const match = link.pathname.match(/^\/games\/([1-9]\d{0,15})(?:\/[^?#]*)?\/?$/);
  if (link.protocol !== "https:" || !["www.roblox.com", "roblox.com"].includes(link.hostname) || link.username || link.password || link.port || !match) throw new Error("Use an HTTPS Roblox game link");
  const placeId = Number(match[1]);
  if (!Number.isSafeInteger(placeId)) throw new Error("Invalid Roblox place ID");
  if (typeof record.imageUrl !== "string" || !record.imageUrl || record.imageUrl.length > 2048) throw new Error("Game image URL is required");
  const imageUrl = record.imageUrl.trim();
  if (!/^\/games\/[a-z0-9-]+\.(png|webp|jpe?g)$/.test(imageUrl)) {
    let image: URL;
    try { image = new URL(imageUrl); } catch { throw new Error("Use an HTTPS image URL"); }
    if (image.protocol !== "https:" || image.username || image.password || image.port || image.hostname === "localhost" || image.hostname.endsWith(".local") || image.hostname.startsWith("[") || /^\d+\.\d+\.\d+\.\d+$/.test(image.hostname)) throw new Error("Use a public HTTPS image URL");
  }
  return { id, name, imageUrl, gameUrl: `https://www.roblox.com/games/${placeId}`, enabled: record.enabled, sortOrder: record.sortOrder as number, placeId,
    ...(previous?.universeId && previous.placeId === placeId ? { universeId: previous.universeId } : {}) };
}
