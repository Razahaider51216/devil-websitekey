"use client";
import { useEffect, useState } from "react";
import { ArrowRight, ArrowUpRight, Gamepad2, KeyRound, Search, ShieldCheck } from "lucide-react";
import { api, Header, Footer } from "../components";
import { DiscordAccess } from "../discord-access";
import { useLanguage } from "../language";
import type { SupportedGame } from "../../lib/supported-games";
import { GameImage } from "../game-image";
type UsageGame = SupportedGame & { launches: number | null };

export default function Games() { return <DiscordAccess><GameDirectory/></DiscordAccess>; }
function GameDirectory() {
  const { language } = useLanguage();
  const text = (th: string, en: string) => language === "th" ? th : en;
  const [games, setGames] = useState<UsageGame[] | null>(null), [search, setSearch] = useState(""), [error, setError] = useState("");
  const [order, setOrder] = useState("popular"), [since, setSince] = useState<number | null>(null);
  async function load() { setError("");try { const response = await api("games");setGames(response.games);setSince(response.trackingSince); } catch (e) { setError((e as Error).message); } }
  useEffect(() => { void load();const timer = window.setInterval(load, 60_000);return () => window.clearInterval(timer); }, []);
  const ranked = [...(games || [])].sort((a, b) => (b.launches || 0) - (a.launches || 0) || a.sortOrder - b.sortOrder);
  const ranks = new Map(ranked.filter(game => (game.launches || 0) > 0).map((game, i) => [game.id, i + 1]));
  const filtered = (order === "popular" ? ranked : games)?.filter(game => game.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
  return <><Header active="games"/><main className="site-main games-main">
    <section className="games-heading"><div><div className="eyebrow"><span className="red-square"/> DEVIL HUB / GAME DIRECTORY</div><h1>SUPPORTED<br/><span>GAMES.</span></h1><p>{text("เลือกแมพของคุณ แล้วรับคีย์เพื่อเริ่มใช้งาน DEVIL HUB", "Find your game. Get your key. Start with DEVIL HUB.")}</p></div><div className="games-counter"><Gamepad2 size={28}/><strong>{games ? String(games.length).padStart(2, "0") : "—"}</strong><span>{text("แมพที่รองรับ", "SUPPORTED GAMES")}</span><small><i className="status-dot"/> DEVIL HUB COMPATIBLE</small></div></section>
    <div className="games-toolbar"><label className="search-field"><Search size={18}/><input aria-label={text("ค้นหาแมพ", "Search games")} placeholder={text("ค้นหาชื่อแมพ…", "Search your game…")} value={search} onChange={e => setSearch(e.target.value)}/></label><span className="mono">{filtered?.length ?? "—"} / {games?.length ?? "—"} {text("แมพ", "GAMES")}</span></div>
    <div className="game-usage-heading"><label>{text("เรียงตาม", "Sort by")} <select value={order} onChange={e => setOrder(e.target.value)}><option value="popular">{text("เริ่มรันมากที่สุด", "Most launches")}</option><option value="catalog">{text("ลำดับแมพ", "Game order")}</option></select></label><p>{text("นับการเริ่มรันสคริปต์ที่ผ่าน Key กรองรันซ้ำต่อคีย์/แมพเป็นช่วง 5 นาที ไม่ใช่จำนวนผู้เล่นออนไลน์", "Counts Key-verified script launches, deduplicated per key/game in 5-minute windows. Not online players.")}{since ? " · " + text("เริ่มเก็บ ", "Tracking since ") + new Date(since).toLocaleDateString(language === "th" ? "th-TH" : "en-US") : ""}</p></div>
    {error && <div className="notice error" role="alert">{error}<button onClick={load}>{text("ลองอีกครั้ง", "Try again")}</button></div>}
    {!games && !error && <div className="games-grid" aria-label={text("กำลังโหลดแมพ", "Loading games")}>{Array.from({ length: 6 }, (_, i) => <div className="game-skeleton" key={i}/>)}</div>}
    {games && <div className="games-grid">{filtered?.map((game, i) => <article className="game-card" key={game.id}>
      <div className="game-cover"><GameImage src={game.imageUrl} name={game.name}/><span className="game-index">{String(i + 1).padStart(2, "0")} // SUPPORTED</span><span className="game-ready"><i className="status-dot"/> DEVIL HUB</span></div>
      <div className="game-card-body"><h2>{game.name}</h2><span className="game-platform"><Gamepad2 size={13}/> ROBLOX EXPERIENCE</span><div className="game-usage"><strong>{game.launches === null ? "—" : (game.launches || 0).toLocaleString()}</strong><span>{text("เริ่มรันผ่าน Key", "KEY-VERIFIED LAUNCHES")}</span>{ranks.has(game.id) && <b>#{ranks.get(game.id)}</b>}</div><div className="game-card-actions"><a className="quiet-button" href={game.gameUrl} target="_blank" rel="noopener noreferrer">{text("เข้าแมพ", "Play game")}<ArrowUpRight size={15}/></a><a className="primary-button" href="/"><KeyRound size={15}/>{text("รับคีย์", "Get key")}<ArrowRight size={15}/></a></div></div>
    </article>)}</div>}
    {games && !filtered?.length && <div className="empty-state"><Gamepad2 size={32}/><strong>{text("ไม่พบแมพ", "No games found")}</strong><p>{text("ลองค้นหาด้วยชื่ออื่น", "Try another game name.")}</p>{search && <button className="quiet-button" onClick={() => setSearch("")}>{text("ล้างการค้นหา", "Clear search")}</button>}</div>}
    <section className="games-key-banner"><div><span className="eyebrow"><ShieldCheck size={14}/> YOUR ACCESS STARTS HERE</span><h2>ONE KEY.<br/><span>YOUR NEXT GAME.</span></h2><p>{text("รับคีย์ผ่านภารกิจบนเว็บ แล้วนำไปใส่ใน DEVIL HUB", "Complete the website missions, then use your key in DEVIL HUB.")}</p></div><a className="primary-button" href="/"><KeyRound size={17}/>{text("ไปหน้ารับคีย์", "Get your access key")}<ArrowRight size={17}/></a></section>
  </main><Footer/></>;
}
