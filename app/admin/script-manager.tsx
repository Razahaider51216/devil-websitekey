"use client";
import { useState } from "react";
import { Code2, Upload, RefreshCw, ShieldCheck } from "lucide-react";
import { api, CopyButton, date } from "../components";
import { useLanguage } from "../language";
import type { ScriptRecord, ScriptRevision } from "../../lib/script-storage";

export function ScriptManager() {
  const { language } = useLanguage();
  const text = (th: string, en: string) => language === "th" ? th : en;
  const [catalog, setCatalog] = useState<{ configured: boolean; scripts: ScriptRecord[] } | null>(null);
  const [slug, setSlug] = useState(""), [files, setFiles] = useState<File[]>([]);
  const [selected, setSelected] = useState(""), [revisions, setRevisions] = useState<ScriptRevision[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const headers = {};
  async function load() { const result = await api("admin/scripts", { headers }); setCatalog(result); return result; }
  async function run(action: () => Promise<void>) {
    setBusy(true); setError(""); setNotice("");
    try { await action(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  async function history(id: string, more?: string) {
    const result = await api(`admin/scripts/${id}${more ? "?cursor=" + encodeURIComponent(more) : ""}`, { headers });
    setSelected(id); setRevisions(previous => more ? [...previous, ...result.revisions] : result.revisions); setCursor(result.cursor);
  }
  async function upload() {
    if (!files.length) throw new Error(text("เลือกไฟล์ Lua ก่อน", "Select Lua files first"));
    const names = files.map(file => files.length === 1 && slug ? slug : file.name.replace(/\.lua$/i, "").toLowerCase());
    if (names.some(id => !/^[a-z0-9][a-z0-9-]{0,79}$/.test(id)) || new Set(names).size !== names.length) throw new Error(text("ชื่อไฟล์ต้องใช้ a-z, 0-9 และขีดกลาง และห้ามซ้ำ", "Use unique IDs with a-z, 0-9 and hyphens"));
    if (files.some(file => file.size === 0 || file.size > 8 * 1024 * 1024 || !/\.lua$/i.test(file.name))) throw new Error(text("ใช้ไฟล์ .lua ขนาดไม่เกิน 8 MiB", "Use .lua files up to 8 MiB each"));
    let count = 0;
    try {
      for (let index = 0; index < files.length; index++) {
        const response = await fetch(`/api/admin/scripts/${names[index]}`, { method: "POST", headers: { ...headers, "Content-Type": "text/plain; charset=utf-8" }, body: files[index] });
        const result = await response.json() as { error?: string }; if (!response.ok) throw new Error(result.error || "Upload failed");
        count++;
      }
      setNotice(text(`อัปโหลด ${count} ไฟล์เป็นฉบับร่างแล้ว ยังไม่เปลี่ยนตัวรันหลัก`, `${count} files uploaded as drafts. Main loader is unchanged.`));
    } catch (e) { throw new Error(`${count}/${files.length} uploaded. ${(e as Error).message}`); }
    finally { await load(); }
    if (names.length === 1) await history(names[0]);
  }
  async function activate(id: string, revision: string) {
    await api(`admin/scripts/${id}`, { method: "PUT", headers, body: JSON.stringify({ revision }) });
    await load(); setNotice(text("เปิดเวอร์ชันนี้สำหรับการทดสอบดาวน์โหลดแล้ว ตัวรัน Git เดิมยังเหมือนเดิม", "Revision enabled for download testing. Existing Git loader is unchanged."));
  }
  return <section className="script-manager key-manager">
    <div className="manager-top"><h2><Code2 size={20}/> SCRIPT VAULT</h2><button type="button" className="quiet-button" disabled={busy} onClick={() => run(async () => { await load(); })}><RefreshCw size={15}/> {text("โหลดรายการ", "Load scripts")}</button></div>
    <p className="script-description">{text("เก็บ Lua แบบส่วนตัว • ตรวจคีย์และ HWID ก่อนดาวน์โหลด • แยกเวอร์ชันและย้อนกลับได้", "Private Lua storage • Key and HWID checked before download • Version history and rollback")}</p>
    {error && <div className="notice error" role="alert">{error}</div>}
    {notice && <div className="notice" role="status">{notice}</div>}
    {catalog && !catalog.configured && <div className="notice error">{text("ยังไม่ได้เชื่อม R2 binding SCRIPT_FILES", "R2 binding SCRIPT_FILES is not connected")}</div>}
    <form className="script-upload" onSubmit={event => { event.preventDefault(); void run(upload); }}>
      <label>{text("ไฟล์ Lua (เลือกหลายไฟล์ได้)", "Lua files (multiple supported)")}<input type="file" accept=".lua" multiple disabled={busy} onChange={e => setFiles(Array.from(e.target.files || []))}/></label>
      <label>{text("Script ID สำหรับไฟล์เดียว (เว้นว่างเพื่อใช้ชื่อไฟล์)", "Script ID for a single file (blank uses filename)")}<input value={slug} onChange={e => setSlug(e.target.value)} placeholder="anime-dice" pattern="[a-z0-9][a-z0-9-]{0,79}" maxLength={80} disabled={busy}/></label>
      <button className="primary-button" disabled={busy || !files.length || catalog?.configured === false}><Upload size={16}/> {busy ? text("กำลังดำเนินการ…", "Working…") : text("อัปโหลดฉบับร่าง", "Upload drafts")}</button>
    </form>
    {catalog && <div className="table-scroll"><table><thead><tr><th>SCRIPT</th><th>ACTIVE REVISION</th><th>ACTIONS</th></tr></thead><tbody>{catalog.scripts.map(item => <tr key={item.slug}><td><strong>{item.slug}</strong><span className={`pill ${item.enabled ? "success" : "muted-pill"}`}>{item.enabled ? "ENABLED" : "DRAFT / DISABLED"}</span></td><td><code>{item.active?.revision || "—"}</code><small>{item.active ? `${item.active.bytes.toLocaleString()} bytes` : "—"}</small></td><td><div className="row-actions"><button className="quiet-button" disabled={busy} onClick={() => run(() => history(item.slug))}>{text("เวอร์ชัน", "Versions")}</button>{item.enabled && <button className="quiet-button" disabled={busy} onClick={() => run(async () => { await api(`admin/scripts/${item.slug}`, { method: "PUT", headers, body: JSON.stringify({ enabled: false }) }); await load(); })}>{text("ปิดดาวน์โหลด", "Disable")}</button>}</div></td></tr>)}</tbody></table>{!catalog.scripts.length && <p className="script-description">{text("ยังไม่มีไฟล์ Lua ในคลัง", "No Lua files uploaded")}</p>}</div>}
    {selected && <div className="script-history"><h3><ShieldCheck size={17}/> {selected}</h3><p className="script-description">{text("เลือกเวอร์ชันก่อนทดสอบ ระบบเก็บไฟล์เดิมไว้เสมอ", "Select a revision for testing. Previous files are retained.")}</p>{revisions.map(item => <div className="script-revision" key={item.revision}><div><code>{item.revision}</code><small>{date(item.createdAt, language)} · {item.bytes.toLocaleString()} bytes</small><code className="script-hash">SHA-256: {item.sha256}</code></div><button className="quiet-button" disabled={busy} onClick={() => run(() => activate(selected, item.revision))}>{text("ใช้เวอร์ชันนี้", "Activate")}</button></div>)}{cursor && <button className="quiet-button" disabled={busy} onClick={() => run(() => history(selected, cursor))}>{text("โหลดเวอร์ชันเพิ่ม", "More versions")}</button>}<CopyButton value={`https://devil-hub.dev/api/scripts/download`} label={text("คัดลอก API สำหรับทดสอบ", "Copy test API")}/></div>}
  </section>;
}
