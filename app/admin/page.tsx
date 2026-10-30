"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight, ArrowUpRight, Check, KeyRound, Plus, Search, ShieldCheck, LogOut, Ban, Loader2, Infinity as InfinityIcon, CalendarDays } from "lucide-react";
import { Header, Footer, CopyButton, api, date } from "../components";
import { useLanguage } from "../language";
import { LinkSettings } from "./link-settings";
import { ScriptManager } from "./script-manager";
import { KeyCountdown } from "../key-countdown";
import { remainingKeyTime } from "../../lib/countdown";
import { DiscordAccess } from "../discord-access";
import { GameManager } from "./game-manager";
import { SupportInbox } from "./support-inbox";
type AdminSection = "overview" | "keys" | "games" | "missions" | "scripts" | "chat";
type Key = { id: string; key: string; label: string; source: string; createdAt: number; expiresAt: number | null; status: string; kind: string; amount: number };
export default function Admin() {
  return <DiscordAccess adminOnly><AdminPanel/></DiscordAccess>;
}
function AdminPanel() {
  const { t, language } = useLanguage();
  const [section, setSection] = useState<AdminSection>("overview");
  const [clock, setClock] = useState(Date.now());
  const offset = useRef(0);
  useEffect(() => {
    const tick = () => setClock(Date.now());
    const timer = setInterval(tick, 1000);
    document.addEventListener("visibilitychange", tick);
    return () => { clearInterval(timer); document.removeEventListener("visibilitychange", tick); };
  }, []);
  const [data, setData] = useState<any>(null), [error, setError] = useState(""), [busy, setBusy] = useState(false), [kind, setKind] = useState("days"), [amount, setAmount] = useState(30), [label, setLabel] = useState(""), [search, setSearch] = useState(""), [created, setCreated] = useState<Key | null>(null);
  const load = useCallback(async () => { const response = await api("admin/keys"); offset.current = response.serverNow - Date.now(); setClock(Date.now()); setData(response); }, []);
  useEffect(() => { sessionStorage.removeItem("devil-admin"); setBusy(true); load().catch(e => setError(e.message)).finally(() => setBusy(false)); }, [load]);
  async function create(e: React.FormEvent) { e.preventDefault(); setBusy(true); setError(""); try { const key = await api("admin/keys", { method: "POST", body: JSON.stringify({ label, kind, amount }) }); setCreated(key); setLabel(""); await load(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } }
  async function revoke(key: Key) { if (!window.confirm(t("ยกเลิกคีย์ “{label}”? ผู้ใช้จะไม่สามารถใช้คีย์นี้ต่อได้", { label: key.label }))) return; setBusy(true); setError(""); try { await api(`admin/keys/${key.id}`, { method: "DELETE" }); await load(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } }
  async function logout() { setBusy(true); setError(""); try { await api("auth/logout", { method: "POST", body: "{}" }); window.location.assign("/"); } catch (e) { setError((e as Error).message); setBusy(false); } }

  const filtered: Key[] = (data?.keys || []).map((key: Key) => { const state = remainingKeyTime(key.expiresAt, key.status, clock + offset.current).state; return { ...key, status: state === "permanent" ? "active" : state }; }).filter((k: Key) => `${k.label} ${k.key} ${k.status}`.toLowerCase().includes(search.toLowerCase()));
  return <><Header admin/><main className="site-main admin-main">{!data ? <section className="admin-login"><div className="eyebrow"><ShieldCheck size={15}/> DISCORD ADMIN ACCESS</div><h1>CONTROL<br/><span>CENTER.</span></h1>{error ? <><div className="notice error" role="alert">{t(error)}</div><button className="quiet-button" disabled={busy} onClick={() => { setBusy(true); setError(""); load().catch(e => setError(e.message)).finally(() => setBusy(false)); }}>{t("ลองอีกครั้ง")}</button></> : <Loader2 className="spin" size={24}/>}<a href="/">{t("กลับหน้ารับคีย์")} <ArrowUpRight size={14}/></a></section> : <>
    <div className="admin-heading"><div><span className="eyebrow"><i className="status-dot"/> ADMINISTRATOR / DEVIL KEY</span><h1>CONTROL <span>CENTER.</span></h1><p>{t("สร้าง จัดการ และติดตามคีย์ของ DEVIL HUB")}</p></div><button className="quiet-button" onClick={logout}><LogOut size={16}/> {t("ออกจากระบบ")}</button></div>
    {error && <div className="notice error" role="alert">{t(error)}</div>}
    <div className="admin-navigation"><div><span className="eyebrow muted">CONTROL MODULES</span><label htmlFor="admin-section">{t("เลือกหมวดจัดการ")}</label></div><select id="admin-section" value={section} onChange={e => setSection(e.target.value as AdminSection)}>{([["overview", "ภาพรวม"],["keys", "จัดการคีย์"],["games", "จัดการแมพ"],["missions", "ลิงก์ภารกิจ"],["scripts", "ไฟล์สคริปต์"],["chat", "ช่องแชท"]] as const).map(([value, label]) => <option key={value} value={value}>{t(label)}</option>)}</select></div>
    {section === "overview" && <><div className="stats-grid">{[[t("คีย์ทั้งหมด"), data.stats.total || 0, KeyRound], [t("พร้อมใช้งาน"), data.stats.active || 0, Check], [t("คีย์ถาวร"), data.stats.permanent || 0, InfinityIcon], [t("ถูกยกเลิก"), data.stats.revoked || 0, Ban]].map(([text, value, Icon]: any, i) => <div className="stat-card" key={text}><span>{text}<Icon size={16}/></span><strong>{String(value).padStart(2, "0")}</strong><small>{["TOTAL ISSUED", "ACTIVE ACCESS", "LIFETIME ACCESS", "REVOKED ACCESS"][i]}</small></div>)}</div>
    <div className="admin-overview-links">{(["keys", "games", "missions", "scripts"] as const).map((value, i) => <button className="quiet-button" key={value} onClick={() => setSection(value)}>{t(["จัดการคีย์","จัดการแมพ","ลิงก์ภารกิจ","ไฟล์สคริปต์"][i])}<ArrowRight size={16}/></button>)}</div></>}
    {section === "keys" && <>{created && <div className="created-banner" role="status"><div><span className="eyebrow"><Check size={14}/> KEY CREATED</span><strong>{created.label}</strong><code>{created.key}</code><small>{date(created.expiresAt, language)}</small><KeyCountdown expiresAt={created.expiresAt} status={created.status} now={clock + offset.current}/></div><CopyButton value={created.key}/><button className="dismiss" aria-label={t("ปิดคีย์ที่สร้างแล้ว")} onClick={() => setCreated(null)}>×</button></div>}
    <div className="admin-layout"><section className="key-manager"><div className="manager-top"><h2>{t("รายการคีย์")} <span className="count-badge">{data.stats.total || 0}</span></h2><button className="quiet-button" disabled={busy} onClick={() => load().catch(e => setError(e.message))}>{t("รีเฟรช")}</button></div><label className="search-field"><Search size={17}/><input aria-label={t("ค้นหาคีย์")} placeholder={t("ค้นหาชื่อ คีย์ หรือสถานะ...")} value={search} onChange={e => setSearch(e.target.value)}/></label><div className="table-scroll"><table><thead><tr><th>KEY / LABEL</th><th>STATUS</th><th>EXPIRES</th><th>ACTIONS</th></tr></thead><tbody>{filtered.map(key => <tr key={key.id}><td><strong>{key.label}</strong><code>{key.key.slice(0, 20)}••••</code><small>{key.source === "admin" ? t("สร้างโดยแอดมิน") : t("ผู้ใช้ทำขั้นตอน")} · {date(key.createdAt, language)}</small></td><td><span className={`pill ${key.status === "active" ? "success" : "muted-pill"}`}>{key.status === "active" ? t("ใช้งานได้") : key.status === "expired" ? t("หมดอายุ") : t("ยกเลิกแล้ว")}</span></td><td>{key.expiresAt === null ? <span className="forever"><InfinityIcon size={16}/> {t("ถาวร")}</span> : date(key.expiresAt, language)}<KeyCountdown expiresAt={key.expiresAt} status={key.status} now={clock + offset.current}/></td><td><div className="row-actions"><CopyButton value={key.key} label={t("คัดลอก")}/><button title={t("ยกเลิกคีย์")} aria-label={t("ยกเลิกคีย์ {label}", { label: key.label })} className="revoke-button" disabled={busy || key.status === "revoked"} onClick={() => revoke(key)}><Ban size={15}/></button></div></td></tr>)}</tbody></table>{!filtered.length && <div className="empty-state"><KeyRound size={28}/><strong>{search ? t("ไม่พบคีย์ที่ค้นหา") : t("ยังไม่มีคีย์ในระบบ")}</strong><p>{t("สร้างคีย์ใหม่ หรือรอผู้ใช้ทำครบ 4 ขั้นตอน")}</p></div>}</div><div className="table-note">{t("แสดงล่าสุดไม่เกิน 200 คีย์ · เวลาในประเทศไทย")}</div></section>
    <aside><form className="create-card" onSubmit={create}><div className="eyebrow"><Plus size={14}/> ISSUE NEW ACCESS</div><h2>{t("สร้างคีย์ใหม่")}</h2><p>{t("เลือกอายุการใช้งานสำหรับคีย์นี้")}</p><label className="field-label" htmlFor="key-label">{t("ชื่อ / หมายเหตุ")}</label><input id="key-label" placeholder={t("เช่น VIP · DEVIL MEMBER")} maxLength={80} value={label} onChange={e => setLabel(e.target.value)}/><label className="field-label">{t("รูปแบบคีย์")}</label><div className="duration-options">{[["permanent", t("ถาวร")], ["days", t("วัน")], ["months", t("เดือน")]].map(([value, text]) => <button type="button" className={kind === value ? "selected" : ""} key={value} onClick={() => { setKind(value); setAmount(value === "months" ? 1 : 30); }}>{value === "permanent" ? <InfinityIcon size={15}/> : <CalendarDays size={15}/>} {text}</button>)}</div>{kind !== "permanent" && <><label className="field-label" htmlFor="duration">{t(kind === "days" ? "จำนวนวัน" : "จำนวนเดือน")}</label><input id="duration" type="number" min={1} max={kind === "days" ? 3650 : 120} value={amount} onChange={e => setAmount(Number(e.target.value))} required/></>}<div className="duration-summary"><CalendarDays size={16}/>{kind === "permanent" ? t("ใช้ได้ตลอด ไม่มีวันหมดอายุ") : t("นับอายุ {amount} {unit} ตั้งแต่สร้างคีย์", { amount: amount || "—", unit: kind === "days" ? t("วัน") : t("เดือน") })}</div><button className="primary-button" disabled={busy}>{busy ? <Loader2 size={17} className="spin"/> : <Plus size={17}/>} {t("สร้างคีย์")} <ArrowRight size={17}/></button></form></aside></div>
    </>}
    {section === "missions" && <section className="admin-missions"><LinkSettings configuration={data.configuration} onSaved={configuration => setData((current: any) => ({ ...current, configuration }))}/></section>}
    {section === "games" && <GameManager/>}
    {section === "scripts" && <ScriptManager/>}
    {section === "chat" && <SupportInbox/>}
    </>}</main><Footer/></>;
}
