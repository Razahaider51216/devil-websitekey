"use client";
import { useEffect, useState } from "react";
import { Check, Loader2, Save } from "lucide-react";
import { api, date } from "../components";
import { useLanguage } from "../language";
import type { Links } from "../../lib/settings";
import { plans, planFor, type PlanId } from "../../lib/plans";

type ModeConfiguration = { plan: PlanId; links: Links; updatedAt: number | null };
type Configuration = { links: Links; updatedAt: number | null; modes: ModeConfiguration[] };
export function LinkSettings({ configuration, token, onSaved }: { configuration: Configuration; token: string; onSaved: (value: Configuration) => void }) {
  const { t, language } = useLanguage();
  const [mode, setMode] = useState<PlanId>("24h");
  const active = configuration.modes.find(item => item.plan === mode)!;
  const [links, setLinks] = useState(active.links), [busy, setBusy] = useState(false), [error, setError] = useState(""), [saved, setSaved] = useState(false);
  const persisted = JSON.stringify(active.links);
  useEffect(() => { setLinks(JSON.parse(persisted)); }, [persisted, mode]);
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
      const result = await api("admin/settings", { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify({ links, plan: mode }) });
      onSaved(result); setLinks(result.modes.find((item: ModeConfiguration) => item.plan === mode).links); setSaved(true);
    } catch (error) { setError((error as Error).message); } finally { setBusy(false); }
  }
  return <form className="config-card link-settings" onSubmit={save}>
    <span className="eyebrow muted">STEP LINKS</span><h3>{t("ตั้งค่าลิงก์ภารกิจ")}</h3>
    <div className="mode-tabs">{plans.map(plan => <button type="button" key={plan.id} className={mode === plan.id ? "selected" : ""} disabled={busy} onClick={() => { setMode(plan.id); setSaved(false); setError(""); }}>{plan.hours}H</button>)}</div>
    <p>{t("แก้ลิงก์และบันทึกได้ทันที ไม่ต้อง deploy ใหม่")}</p>
    <p className="mode-description">{t("{steps} ภารกิจลิงก์ · รอ {seconds} วินาทีต่อภารกิจ + ยืนยันบอท", { steps: planFor(mode).linkSteps, seconds: planFor(mode).waitSeconds })}</p>
    {mode === "6h" && <label className="link-field" htmlFor="six-hour-service"><span className="field-label">{t("เลือกภารกิจ 6H")}</span><select className="service-select" id="six-hour-service" value={links.sixHourService || "discord"} disabled={busy} onChange={e => { setLinks(current => ({ ...current, sixHourService: e.target.value as "discord" | "youtube" })); setSaved(false); }}><option value="discord">Discord</option><option value="youtube">YouTube</option></select></label>}
    {fields.filter(([field]) => mode === "6h" ? field === (links.sixHourService === "youtube" ? "channelUrl" : "discordUrl") : (mode === "24h" ? field !== "likeUrl" : ["discordUrl", "channelUrl"].includes(field))).map(([field, label, placeholder]) => <label className="link-field" key={field} htmlFor={`link-${field}`}><span className="field-label">{t(label)}</span><input id={`link-${field}`} name={field} type="url" inputMode="url" maxLength={2048} value={links[field]} placeholder={placeholder || t("เว้นว่างเพื่อใช้ลิงก์วิดีโอล่าสุด")} onChange={e => { setLinks(current => ({ ...current, [field]: e.target.value })); setSaved(false); }} disabled={busy}/></label>)}
    <p className="link-warning">{t("การเปลี่ยนลิงก์ทำให้ผู้ใช้ที่ยังไม่ได้รับคีย์ต้องทำขั้นตอนที่เปลี่ยนใหม่")}</p>
    {error && <p className="settings-error" role="alert">{t(error)}</p>}
    {saved && <p className="settings-success" role="status"><Check size={14}/>{t("บันทึกลิงก์เรียบร้อยแล้ว")}</p>}
    <button className="primary-button" disabled={busy}>{busy ? <Loader2 className="spin" size={16}/> : <Save size={16}/>} {t("บันทึกลิงก์")} {mode.toUpperCase()}</button>
    <p className="settings-saved-at">{active.updatedAt ? <>{t("บันทึกล่าสุด")} · {date(active.updatedAt, language)}</> : t("ยังใช้ค่าเริ่มต้นจากเซิร์ฟเวอร์")}</p>
  </form>;
}
