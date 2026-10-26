"use client";
import { useEffect, useState } from "react";
import { Check, Loader2, Save } from "lucide-react";
import { api, date } from "../components";
import { useLanguage } from "../language";
import type { Links } from "../../lib/settings";

type Configuration = { links: Links; updatedAt: number | null };
export function LinkSettings({ configuration, token, onSaved }: { configuration: Configuration; token: string; onSaved: (value: Configuration) => void }) {
  const { t, language } = useLanguage();
  const [links, setLinks] = useState(configuration.links), [busy, setBusy] = useState(false), [error, setError] = useState(""), [saved, setSaved] = useState(false);
  const persisted = JSON.stringify(configuration.links);
  useEffect(() => { setLinks(JSON.parse(persisted)); }, [persisted]);
  const fields: [keyof Links, string, string][] = [
    ["discordUrl", "ลิงก์เชิญ Discord", "https://discord.gg/..."],
    ["channelUrl", "ลิงก์ช่อง YouTube", "https://www.youtube.com/@..."],
    ["videoUrl", "ลิงก์วิดีโอล่าสุด", "https://www.youtube.com/watch?v=..."],
    ["commentUrl", "คลิปสำหรับคอมเมนต์ (ไม่บังคับ)", ""],
    ["likeUrl", "คลิปสำหรับกดไลค์ (ไม่บังคับ)", ""],
  ];
  async function save(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError(""); setSaved(false);
    try {
      const result = await api("admin/settings", { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify({ links }) });
      onSaved(result); setLinks(result.links); setSaved(true);
    } catch (error) { setError((error as Error).message); } finally { setBusy(false); }
  }
  return <form className="config-card link-settings" onSubmit={save}>
    <span className="eyebrow muted">STEP LINKS</span><h3>{t("ตั้งค่าลิงก์ภารกิจ")}</h3>
    <p>{t("แก้ลิงก์และบันทึกได้ทันที ไม่ต้อง deploy ใหม่")}</p>
    {fields.map(([field, label, placeholder]) => <label className="link-field" key={field} htmlFor={`link-${field}`}><span className="field-label">{t(label)}</span><input id={`link-${field}`} name={field} type="url" inputMode="url" maxLength={2048} value={links[field]} placeholder={placeholder || t("เว้นว่างเพื่อใช้ลิงก์วิดีโอล่าสุด")} onChange={e => { setLinks(current => ({ ...current, [field]: e.target.value })); setSaved(false); }} disabled={busy}/></label>)}
    <p className="link-warning">{t("การเปลี่ยนลิงก์ทำให้ผู้ใช้ที่ยังไม่ได้รับคีย์ต้องทำขั้นตอนที่เปลี่ยนใหม่")}</p>
    {error && <p className="settings-error" role="alert">{t(error)}</p>}
    {saved && <p className="settings-success" role="status"><Check size={14}/>{t("บันทึกลิงก์เรียบร้อยแล้ว")}</p>}
    <button className="primary-button" disabled={busy}>{busy ? <Loader2 className="spin" size={16}/> : <Save size={16}/>} {t("บันทึกลิงก์")}</button>
    <p className="settings-saved-at">{configuration.updatedAt ? <>{t("บันทึกล่าสุด")} · {date(configuration.updatedAt, language)}</> : t("ยังใช้ค่าเริ่มต้นจากเซิร์ฟเวอร์")}</p>
  </form>;
}
