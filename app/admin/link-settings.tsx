"use client";
import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Check, Loader2, Plus, Save, ShieldCheck, Trash2 } from "lucide-react";
import { api, date } from "../components";
import { useLanguage } from "../language";
import type { Links, Mission } from "../../lib/settings";
import { plans, planFor, type PlanId } from "../../lib/plans";

type ModeConfiguration = { plan: PlanId; links: Links; steps: Mission[]; updatedAt: number | null };
type Configuration = { links: Links; updatedAt: number | null; modes: ModeConfiguration[] };
export function LinkSettings({ configuration, onSaved }: { configuration: Configuration; onSaved: (value: Configuration) => void }) {
  const { language } = useLanguage();
  const text = (th:string,en:string) => language === "th" ? th : en;
  const [mode,setMode] = useState<PlanId>("24h"), [busy,setBusy] = useState(false), [error,setError] = useState(""), [saved,setSaved] = useState(false);
  const active = configuration.modes.find(item => item.plan === mode)!;
  const persisted = JSON.stringify(active.steps);
  const [missions,setMissions] = useState<Mission[]>(active.steps);
  useEffect(() => { setMissions(JSON.parse(persisted)); },[persisted,mode]);
  function update(index:number,fields:Partial<Mission>) { setMissions(rows => rows.map((row,i) => i === index ? { ...row,...fields } : row));setSaved(false); }
  function move(index:number,direction:number) {
    setMissions(rows => { const next=[...rows];[next[index],next[index+direction]]=[next[index+direction],next[index]];return next; });setSaved(false);
  }
  async function save(event:React.FormEvent) {
    event.preventDefault();setBusy(true);setError("");setSaved(false);
    try {
      const result = await api("admin/settings",{method:"POST",body:JSON.stringify({plan:mode,links:{...active.links,missions}})});
      onSaved(result);setSaved(true);
    } catch(e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  return <form className="config-card link-settings mission-settings" onSubmit={save}>
    <span className="eyebrow muted">MISSION CONTROL</span><h3>{text("จัดการ Step และเวลารอ","Manage steps and wait times")}</h3>
    <div className="mode-tabs">{plans.map(plan => <button type="button" key={plan.id} className={mode===plan.id?"selected":""} disabled={busy} onClick={()=>{setMode(plan.id);setSaved(false);setError("");}}>{plan.hours}H</button>)}</div>
    <p>{text("เพิ่ม Step ได้ตามต้องการ ตั้งลิงก์และเวลารอแยกทุก Step บันทึกแล้วใช้งานได้ทันที","Add steps as needed, with a separate link and wait time for each. Changes apply immediately after saving.")}</p>
    <p className="mode-description">{missions.length} {text("Step ลิงก์ + ยืนยันบอท 1 ขั้นตอน","link steps + 1 human verification step")}</p>
    <div className="mission-editor-list">{missions.map((mission,index)=><fieldset className="mission-editor" key={index} disabled={busy}>
      <legend>STEP {String(index+1).padStart(2,"0")}</legend>
      <div className="mission-editor-actions">
        <button type="button" className="quiet-button" aria-label={text("เลื่อนขึ้น","Move up")+" "+(index+1)} disabled={busy||index===0} onClick={()=>move(index,-1)}><ArrowUp size={15}/></button>
        <button type="button" className="quiet-button" aria-label={text("เลื่อนลง","Move down")+" "+(index+1)} disabled={busy||index===missions.length-1} onClick={()=>move(index,1)}><ArrowDown size={15}/></button>
        <button type="button" className="quiet-button" aria-label={text("ลบ Step","Remove step")+" "+(index+1)} disabled={busy||missions.length===1} onClick={()=>{setMissions(rows=>rows.filter((_,i)=>i!==index));setSaved(false);}}><Trash2 size={15}/></button>
      </div>
      <div className="mission-editor-grid">
        <label><span className="field-label">{text("ชื่อ Step","Step title")}</span><input required maxLength={160} value={mission.title} onChange={e=>update(index,{title:e.target.value})}/></label>
        <label><span className="field-label">{text("ประเภท","Type")}</span><select className="service-select" value={mission.service} onChange={e=>update(index,{service:e.target.value as Mission["service"]})}>{["DISCORD","YOUTUBE","COMMENT","LIKE","LINK"].map(service=><option key={service}>{service}</option>)}</select></label>
        <label className="mission-editor-wide"><span className="field-label">{text("ลิงก์ HTTPS","HTTPS link")}</span><input required type="url" placeholder="https://" maxLength={2048} value={mission.url} onChange={e=>update(index,{url:e.target.value})}/></label>
        <label><span className="field-label">{text("คำอธิบาย (ไม่บังคับ)","Description (optional)")}</span><input maxLength={320} value={mission.subtitle} onChange={e=>update(index,{subtitle:e.target.value})}/></label>
        <label><span className="field-label">{text("เวลารอ (วินาที)","Wait time (seconds)")}</span><input required type="number" min={0} step={1} value={mission.waitSeconds} onChange={e=>update(index,{waitSeconds:e.target.value===""?0:Number(e.target.value)})}/></label>
      </div>
    </fieldset>)}</div>
    <button className="quiet-button mission-add" type="button" disabled={busy} onClick={()=>{setMissions(rows=>[...rows,{title:"Step "+(rows.length+1),subtitle:"",service:"LINK",url:"",waitSeconds:rows.at(-1)?.waitSeconds??planFor(mode).waitSeconds}]);setSaved(false);}}><Plus size={16}/>{text("เพิ่ม Step","Add step")}</button>
    <p className="mission-verification"><ShieldCheck size={17}/>{text("ยืนยันบอทเป็นขั้นตอนสุดท้าย ผ่านแล้วรับคีย์ได้ทันที ไม่มีเวลารอเพิ่ม","Human verification stays last. Claim your key immediately after passing, with no additional wait.")}</p>
    <p className="link-warning">{text("การเปลี่ยน Step หรือเวลารอจะให้ผู้ที่ยังไม่ได้รับคีย์ทำขั้นตอนที่เปลี่ยนใหม่ คีย์ที่รับไปแล้วยังใช้งานได้ตามเดิม","Changed steps or wait times must be completed again by users who have not claimed a key. Existing keys keep their expiry.")}</p>
    {error&&<p className="settings-error" role="alert">{error}</p>}
    {saved&&<p className="settings-success" role="status"><Check size={14}/>{text("บันทึกเรียบร้อยแล้ว","Settings saved")}</p>}
    <button className="primary-button" disabled={busy}>{busy?<Loader2 className="spin" size={16}/>:<Save size={16}/>} {text("บันทึก","Save")} {mode.toUpperCase()}</button>
    <p className="settings-saved-at">{active.updatedAt?date(active.updatedAt,language):text("ค่าเริ่มต้นจากระบบ","System defaults")}</p>
  </form>;
}
