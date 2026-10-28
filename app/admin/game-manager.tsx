"use client";
import { useCallback, useEffect, useState } from "react";
import { ArrowUpRight, Check, Gamepad2, Loader2, Pencil, Plus, RefreshCw, Save, Trash2, X } from "lucide-react";
import { api } from "../components";
import { useLanguage } from "../language";
import { GameImage } from "../game-image";
import type { SupportedGame } from "../../lib/supported-games";

type Catalog = { games: SupportedGame[]; revision: number };
type Draft = Pick<SupportedGame, "name" | "imageUrl" | "gameUrl" | "enabled" | "sortOrder">;
const blank: Draft = { name: "", imageUrl: "", gameUrl: "", enabled: true, sortOrder: 0 };
export function GameManager() {
  const { language } = useLanguage();
  const text = (th: string, en: string) => language === "th" ? th : en;
  const [catalog, setCatalog] = useState<Catalog | null>(null), [draft, setDraft] = useState<Draft>(blank), [editing, setEditing] = useState<string | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [saved, setSaved] = useState(false);
  const load = useCallback(async () => { setBusy(true);setError("");try { const result = await api("admin/games");setCatalog(result);setDraft(current => current.name || current.gameUrl ? current : { ...current, sortOrder: result.games.length }); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } }, []);
  useEffect(() => { void load(); }, [load]);
  function reset() { setEditing(null);setDraft({ ...blank, sortOrder: catalog?.games.length ?? 0 });setSaved(false); }
  async function save(event: React.FormEvent) {
    event.preventDefault();if (!catalog) return;setBusy(true);setError("");setSaved(false);
    try { const result = await api(editing ? `admin/games/${editing}` : "admin/games", { method: editing ? "PATCH" : "POST", body: JSON.stringify({ game: draft, revision: catalog.revision }) });setCatalog(result);setEditing(null);setDraft({ ...blank, sortOrder: result.games.length });setSaved(true); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  async function remove(game: SupportedGame) {
    if (!catalog || !confirm(text(`ลบ ${game.name} ออกจากหน้าแมพที่รองรับ?`, `Remove ${game.name} from Supported Games?`))) return;
    setBusy(true);setError("");setSaved(false);
    try { setCatalog(await api(`admin/games/${game.id}`, { method: "DELETE", body: JSON.stringify({ revision: catalog.revision }) }));if (editing === game.id) reset(); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  return <section className="game-manager"><div className="manager-top"><div><span className="eyebrow"><Gamepad2 size={14}/> SUPPORTED GAMES</span><h2>{text("จัดการแมพที่รองรับ", "Manage supported games")}</h2></div><button className="quiet-button" disabled={busy} onClick={load}><RefreshCw size={15}/>{text("รีเฟรช", "Refresh")}</button></div>
    <p className="script-description">{text("เพิ่มชื่อ รูป และลิงก์เข้าแมพที่แสดงบนเว็บได้ทันที การเพิ่มรายการนี้ไม่ได้เพิ่มการรองรับเกมในตัวสคริปต์", "Manage the names, images and game links shown on the website. Adding a listing does not add script compatibility.")}</p>
    {error && <div className="notice error" role="alert">{error}</div>}{saved && <div className="notice success" role="status"><Check size={16}/>{text("บันทึกแมพแล้ว", "Game saved")}</div>}
    <div className="games-admin-layout"><div className="admin-game-list">{!catalog ? <Loader2 className="spin" size={22}/> : <><div className="admin-list-meta"><span>{catalog.games.length} {text("รายการ", "GAMES")}</span><a href="/games" target="_blank" rel="noopener noreferrer">{text("ดูหน้าเว็บ", "View directory")}<ArrowUpRight size={14}/></a></div>{catalog.games.map(game => <article className={`admin-game-row ${editing === game.id ? "editing" : ""}`} key={game.id}><div className="admin-game-thumb"><GameImage src={game.imageUrl} name={game.name}/></div><div className="admin-game-info"><strong>{game.name}</strong><small>{text("ลำดับ", "Order")} {game.sortOrder} · {game.enabled ? text("แสดงบนเว็บ", "Published") : text("ซ่อนไว้", "Hidden")}</small></div><div className="row-actions"><button className="quiet-button icon-only" aria-label={text("แก้ไข ", "Edit ") + game.name} disabled={busy} onClick={() => { setEditing(game.id);setDraft({ name: game.name, imageUrl: game.imageUrl, gameUrl: game.gameUrl, enabled: game.enabled, sortOrder: game.sortOrder });setSaved(false); }}><Pencil size={15}/></button><button className="revoke-button" aria-label={text("ลบ ", "Delete ") + game.name} disabled={busy} onClick={() => remove(game)}><Trash2 size={15}/></button></div></article>)}</>}</div>
      <form className="game-edit-form create-card" onSubmit={save}><div className="manager-top"><h3>{editing ? text("แก้ไขแมพ", "Edit game") : text("เพิ่มแมพใหม่", "Add game")}</h3>{editing && <button type="button" className="quiet-button" disabled={busy} onClick={reset}><X size={15}/>{text("ยกเลิก", "Cancel")}</button>}</div>
        <label className="link-field"><span className="field-label">{text("ชื่อแมพ", "Game name")}</span><input required maxLength={140} value={draft.name} disabled={busy} onChange={e => setDraft({ ...draft, name: e.target.value })}/></label>
        <label className="link-field"><span className="field-label">{text("ลิงก์รูปแมพ", "Game image URL")}</span><input required maxLength={2048} placeholder="https://…" value={draft.imageUrl} disabled={busy} onChange={e => setDraft({ ...draft, imageUrl: e.target.value })}/></label>
        <div className="game-edit-preview">{draft.imageUrl ? <GameImage src={draft.imageUrl} name={draft.name || "Game preview"}/> : <div className="game-image-fallback"><Gamepad2 size={32}/><span>IMAGE PREVIEW</span></div>}</div>
        <label className="link-field"><span className="field-label">{text("ลิงก์เข้าแมพ Roblox", "Roblox game URL")}</span><input type="url" required maxLength={2048} placeholder="https://www.roblox.com/games/…" value={draft.gameUrl} disabled={busy} onChange={e => setDraft({ ...draft, gameUrl: e.target.value })}/></label>
        <label className="link-field"><span className="field-label">{text("ลำดับการแสดง", "Display order")}</span><input type="number" min={0} max={9999} required value={draft.sortOrder} disabled={busy} onChange={e => setDraft({ ...draft, sortOrder: Number(e.target.value) })}/></label>
        <label className="game-visibility"><input type="checkbox" checked={draft.enabled} disabled={busy} onChange={e => setDraft({ ...draft, enabled: e.target.checked })}/><span>{text("แสดงแมพนี้บนหน้าเว็บ", "Show this game in the directory")}</span></label>
        <button className="primary-button" disabled={busy || !catalog}>{busy ? <Loader2 className="spin" size={17}/> : editing ? <Save size={17}/> : <Plus size={17}/>} {editing ? text("บันทึกการแก้ไข", "Save changes") : text("เพิ่มแมพ", "Add game")}</button>
      </form></div>
  </section>;
}
