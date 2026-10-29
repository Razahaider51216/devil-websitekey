// Add the new game without overwriting the administrator's names, order or visibility.
import { readFileSync } from "node:fs";
import { defaultGames } from "../lib/supported-games.seed.ts";
const cfg = JSON.parse(readFileSync("cloudflare.config.json", "utf8"));
const raw = readFileSync(".env.cloudflare.local", "utf8").match(/^\s*CLOUDFLARE_API_TOKEN\s*=\s*(.+?)\s*$/m)?.[1];
if (!raw) throw new Error("Missing Cloudflare token");
const token = raw.replace(/^(["'])(.*)\1$/, "$2");
async function query(sql, params = []) {
  const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/9507af231005e5cfc8290675b502c50e/d1/database/${cfg.database_id}/query`, {
    method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ sql, params }),
  });
  if (!response.ok) throw new Error("Cloudflare database request failed");
  const result = await response.json();if (!result.success) throw new Error("Game registration failed");return result.result[0];
}
const row = (await query("SELECT value,updated_at FROM site_settings WHERE id='supported-games'")).results[0];
const games = row ? JSON.parse(row.value) : defaultGames.map(game => ({ ...game }));
if (!Array.isArray(games)) throw new Error("Invalid stored game catalog");
if (games.some(game => game.id === "steal-a-pet-and-ride-it" || game.placeId === 95168737547508 || game.gameUrl?.includes("/games/95168737547508"))) {
  console.log("Pet Ride already registered; administrator configuration preserved.");
} else {
  const game = defaultGames.find(game => game.id === "steal-a-pet-and-ride-it");
  games.push({ ...game, sortOrder: Math.max(-1, ...games.map(game => game.sortOrder)) + 1 });
  const updatedAt = Math.max(Date.now(), (row?.updated_at || 0) + 1);
  const result = row
    ? await query("UPDATE site_settings SET value=?,updated_at=? WHERE id='supported-games' AND updated_at=?", [JSON.stringify(games), updatedAt, row.updated_at])
    : await query("INSERT INTO site_settings(id,value,updated_at) VALUES('supported-games',?,?) ON CONFLICT DO NOTHING", [JSON.stringify(games), updatedAt]);
  if (result.meta.changes !== 1) throw new Error("Game list changed concurrently; refresh before retrying");
  console.log("Pet Ride added; all existing game records preserved.");
}
