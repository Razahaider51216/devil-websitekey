export const logGames = {
  break: { name: "Break and Steal an Egg", image: "/games/break-and-steal-an-egg.png", currency: "Cash" },
  anime: { name: "Anime Dice", image: "/games/anime-dice.png", currency: "Money" },
  throw: { name: "Throw Food For Animals", image: "/games/throw-food-for-animals.png", currency: "Money" },
} as const;
export type LogGame = keyof typeof logGames;
export type LogItem = { id: string; name: string; rarity: string | null; level: number | null; amount: number;
  statuses: string[]; assetId: string | null; imageUrl: string | null; income: string | null };
function text(v: unknown, max: number, required = false): string | null {
  if (v == null && !required) return null;
  if (typeof v !== "string" || !v.trim() || v.length > max || /[\x00-\x1f\x7f]/.test(v)) throw new Error("Invalid log text");
  return v.trim();
}
export function quantity(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v !== "string" && typeof v !== "number") throw new Error("Invalid amount");
  const s = String(v);
  if (s.length > 64 || !/^\d+(?:\.\d+)?(?:e[+-]?\d+)?$/i.test(s) || !Number.isFinite(Number(s)) || Number(s) < 0) throw new Error("Invalid amount");
  return s;
}
export function imageAsset(v: unknown): string | null {
  if (v == null || v === "") return null;
  const s = String(v), id = s.match(/^(?:rbxassetid:\/\/)?([1-9]\d{0,19})$/)?.[1];
  if (!id) throw new Error("Invalid Roblox asset");
  return id;
}
export function logImageURL(v: unknown): string | null {
  if (v == null || v === "") return null;
  const s = text(v, 2048, true)!; let u: URL;
  try { u = new URL(s); } catch { throw new Error("Invalid image URL"); }
  if (u.protocol !== "https:" || u.username || u.password || u.port ||
    !(u.hostname === "rbxcdn.com" || u.hostname.endsWith(".rbxcdn.com"))) throw new Error("Use a Roblox image");
  return u.href;
}
export function parseLog(input: Record<string, unknown>) {
  const game = input.game as LogGame;
  if (!Object.hasOwn(logGames, game)) throw new Error("Unsupported LOG game");
  const sessionId = text(input.sessionId, 80, true)!;
  if (!/^[a-zA-Z0-9_-]{8,80}$/.test(sessionId)) throw new Error("Invalid session");
  const player = text(input.player, 100, true)!;
  const balance = quantity(input.balance);
  if (!Array.isArray(input.events) || input.events.length > 20) throw new Error("Maximum 20 log events");
  const seen = new Set<string>();
  const events: LogItem[] = input.events.map((raw: unknown) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("Invalid item");
    const r = raw as Record<string, unknown>, id = text(r.id, 120, true)!;
    if (!/^[a-zA-Z0-9_:-]{8,120}$/.test(id) || seen.has(id)) throw new Error("Invalid/duplicate event ID");
    seen.add(id);
    const amount = r.amount ?? 1, level = r.level ?? null;
    if (!Number.isSafeInteger(amount) || (amount as number) < 1 || (amount as number) > 1_000_000) throw new Error("Invalid item count");
    if (level !== null && (!Number.isSafeInteger(level) || (level as number) < 0 || (level as number) > 1_000_000_000)) throw new Error("Invalid level");
    const statuses = r.statuses ?? [];
    if (!Array.isArray(statuses) || statuses.length > 12) throw new Error("Invalid statuses");
    return { id, name: text(r.name, 160, true)!, rarity: text(r.rarity, 80), level: level as number | null,
      amount: amount as number, statuses: [...new Set(statuses.map(v => text(v, 80, true)!))],
      assetId: imageAsset(r.assetId), imageUrl: logImageURL(r.imageUrl), income: quantity(r.income) };
  });
  return { game, sessionId, player, balance, events };
}
export function formatLogAmount(v: string | null | undefined) {
  if (v == null) return "—";
  const n = Number(v); if (!Number.isFinite(n)) return "—";
  const units = ["", "K", "M", "B", "T", "Qa", "Qi", "Sx", "Sp", "Oc", "No", "Dc"];
  const tier = Math.max(0, Math.floor(Math.log10(Math.max(1, n)) / 3));
  if (tier >= units.length) return n.toExponential(2);
  return new Intl.NumberFormat("en", { maximumFractionDigits: 2 }).format(n / 1000 ** tier) + units[tier];
}
