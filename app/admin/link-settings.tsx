"use client";
import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Check, Languages, Loader2, Plus, Save, ShieldCheck, Trash2 } from "lucide-react";
import { api, date } from "../components";
import { useLanguage } from "../language";
import type { Links, Mission } from "../../lib/settings";
import { plans, planFor, type PlanId } from "../../lib/plans";
import { knownMissionTitles,titleLanguage,type MissionTitles } from "../../lib/mission-titles";
type EditorMission=Mission & {editorId:string;needsTranslation?:boolean;translationState?:"queued"|"loading"|"done"|"error"};
function editable(mission:Mission):EditorMission{return {...knownMissionTitles(mission.title),...mission,editorId:crypto.randomUUID()};}

type ModeConfiguration = { plan: PlanId; links: Links; steps: Mission[]; updatedAt: number | null };
type Configuration = { links: Links; updatedAt: number | null; modes: ModeConfiguration[] };
export function LinkSettings({ configuration, onSaved }: { configuration: Configuration; onSaved: (value: Configuration) => void }) {
  const { language } = useLanguage();
  const text = (th:string,en:string) => language === "th" ? th : en;
  const [mode,setMode] = useState<PlanId>("24h"), [busy,setBusy] = useState(false), [error,setError] = useState(""), [saved,setSaved] = useState(false);
  const active = configuration.modes.find(item => item.plan === mode)!;
  const persisted = JSON.stringify(active.steps);
  const [missions,setMissions] = useState<EditorMission[]>(()=>active.steps.map(editable));
  const requests=useRef(new Map<string,Promise<MissionTitles>>());
  useEffect(() => { setMissions((JSON.parse(persisted) as Mission[]).map(editable)); },[persisted,mode]);
  function update(index:number,fields:Partial<Mission>) {
    setMissions(rows => rows.map((row,i) => {
      if(i!==index)return row;
      if(fields.title!==undefined){const known=knownMissionTitles(fields.title),source=titleLanguage(fields.title);
        return {...row,...fields,titleTh:known?.titleTh||(source==="th"?fields.title:undefined),titleEn:known?.titleEn||(source==="en"?fields.title:undefined),needsTranslation:!known&&!!fields.title.trim(),translationState:known?"done":"queued"};}
      return {...row,...fields};
    }));setSaved(false);
  }
  async function translateRow(row:EditorMission){
    const key=row.editorId+":"+row.title;
    let task=requests.current.get(key);
    if(!task){task=api("admin/translate-title",{method:"POST",body:JSON.stringify({title:row.title})}) as Promise<MissionTitles>;requests.current.set(key,task);}
    setMissions(rows=>rows.map(item=>item.editorId===row.editorId&&item.title===row.title&&item.needsTranslation?{...item,translationState:"loading"}:item));
    try{const pair=await task;
      setMissions(rows=>rows.map(item=>item.editorId===row.editorId&&item.title===row.title&&item.needsTranslation?{...item,...pair,needsTranslation:false,translationState:"done"}:item));return pair;
    }catch(e){setMissions(rows=>rows.map(item=>item.editorId===row.editorId&&item.title===row.title&&item.needsTranslation?{...item,translationState:"error"}:item));throw e;}
    finally{requests.current.delete(key);}
  }
  useEffect(()=>{
    const timers=missions.filter(row=>row.needsTranslation&&row.translationState==="queued"&&row.title.trim()).map(row=>setTimeout(()=>{void translateRow(row).catch(()=>{});},900));
    return()=>timers.forEach(clearTimeout);
  },[missions]);
  function move(index:number,direction:number) {
    setMissions(rows => { const next=[...rows];[next[index],next[index+direction]]=[next[index+direction],next[index]];return next; });setSaved(false);
  }
  async function save(event:React.FormEvent) {
    event.preventDefault();setBusy(true);setError("");setSaved(false);
    try {
      const translated=[];
      for(const row of missions){const pair=row.needsTranslation?await translateRow(row):{};const {editorId,needsTranslation,translationState,...mission}=row;translated.push({...mission,...pair});}
      const result = await api("admin/settings",{method:"POST",body:JSON.stringify({plan:mode,links:{...active.links,missions:translated}})});
      onSaved(result);setSaved(true);
    } catch(e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  return <form className="config-card link-settings mission-settings" onSubmit={save}>
    <span className="eyebrow muted">MISSION CONTROL</span><h3>{text("จัดการ Step และเวลารอ","Manage steps and wait times")}</h3>
    <div className="mode-tabs">{plans.map(plan => <button type="button" key={plan.id} className={mode===plan.id?"selected":""} disabled={busy} onClick={()=>{setMode(plan.id);setSaved(false);setError("");}}>{plan.hours}H</button>)}</div>
    <p>{text("เพิ่ม Step ได้ตามต้องการ ตั้งลิงก์และเวลารอแยกทุก Step บันทึกแล้วใช้งานได้ทันที","Add steps as needed, with a separate link and wait time for each. Changes apply immediately after saving.")}</p>
    <p className="mode-description">{missions.length} {text("Step ลิงก์ + ยืนยันบอท 1 ขั้นตอน","link steps + 1 human verification step")}</p>
    <div className="mission-editor-list">{missions.map((mission,index)=><fieldset className="mission-editor" key={mission.editorId} disabled={busy}>
      <legend>STEP {String(index+1).padStart(2,"0")}</legend>
      <div className="mission-editor-actions">
        <button type="button" className="quiet-button" aria-label={text("เลื่อนขึ้น","Move up")+" "+(index+1)} disabled={busy||index===0} onClick={()=>move(index,-1)}><ArrowUp size={15}/></button>
        <button type="button" className="quiet-button" aria-label={text("เลื่อนลง","Move down")+" "+(index+1)} disabled={busy||index===missions.length-1} onClick={()=>move(index,1)}><ArrowDown size={15}/></button>
        <button type="button" className="quiet-button" aria-label={text("ลบ Step","Remove step")+" "+(index+1)} disabled={busy||missions.length===1} onClick={()=>{setMissions(rows=>rows.filter((_,i)=>i!==index));setSaved(false);}}><Trash2 size={15}/></button>
      </div>
      <div className="mission-editor-grid">
        <div className="mission-title-fields"><label><span className="field-label">{text("ชื่อ Step — ไทยหรืออังกฤษ","Step title — Thai or English")}</span><input required maxLength={160} value={mission.title} onChange={e=>update(index,{title:e.target.value})}/></label>
          <label><span className="field-label">{titleLanguage(mission.title)==="th"?text("คำแปลภาษาอังกฤษ","English translation"):text("คำแปลภาษาไทย","Thai translation")}</span><input maxLength={320} value={(titleLanguage(mission.title)==="th"?mission.titleEn:mission.titleTh)||""} onChange={e=>{
            const value=e.target.value;setMissions(rows=>rows.map(row=>row.editorId===mission.editorId?{...row,...(titleLanguage(row.title)==="th"?{titleEn:value}:{titleTh:value}),needsTranslation:!value.trim(),translationState:value.trim()?"done":"queued"}:row));setSaved(false);
          }}/></label>
          <div className="mission-translation-status"><small role="status">{mission.translationState==="loading"?text("กำลังแปล…","Translating…"):mission.translationState==="error"?text("แปลไม่สำเร็จ กดแปลใหม่หรือกรอกคำแปลเอง","Translation failed. Retry or enter it manually."):text("แปลอัตโนมัติ และแก้คำแปลเองได้","Automatically translated; you can edit the result.")}</small>
            <button type="button" className="quiet-button" disabled={busy||!mission.title.trim()||mission.translationState==="loading"} aria-label={text("แปลชื่อภารกิจ","Translate title")+" "+(index+1)} onClick={()=>{
              const row={...mission,needsTranslation:true};setMissions(rows=>rows.map(item=>item.editorId===row.editorId?{...item,needsTranslation:true}:item));void translateRow(row).catch(()=>{});
            }}>{mission.translationState==="loading"?<Loader2 className="spin" size={14}/>:<Languages size={14}/>}</button>
          </div>
        </div>
        <label><span className="field-label">{text("ประเภท","Type")}</span><select className="service-select" value={mission.service} onChange={e=>update(index,{service:e.target.value as Mission["service"]})}>{["DISCORD","YOUTUBE","COMMENT","LIKE","LINK"].map(service=><option key={service}>{service}</option>)}</select></label>
        <label className="mission-editor-wide"><span className="field-label">{text("ลิงก์ HTTPS","HTTPS link")}</span><input required type="url" placeholder="https://" maxLength={2048} value={mission.url} onChange={e=>update(index,{url:e.target.value})}/></label>
        <label><span className="field-label">{text("คำอธิบาย (ไม่บังคับ)","Description (optional)")}</span><input maxLength={320} value={mission.subtitle} onChange={e=>update(index,{subtitle:e.target.value})}/></label>
        <label><span className="field-label">{text("เวลารอ (วินาที)","Wait time (seconds)")}</span><input required type="number" min={0} step={1} value={mission.waitSeconds} onChange={e=>update(index,{waitSeconds:e.target.value===""?0:Number(e.target.value)})}/></label>
      </div>
    </fieldset>)}</div>
    <button className="quiet-button mission-add" type="button" disabled={busy} onClick={()=>{setMissions(rows=>[...rows,editable({title:"Step "+(rows.length+1),subtitle:"",service:"LINK",url:"",waitSeconds:rows.at(-1)?.waitSeconds??planFor(mode).waitSeconds})]);setSaved(false);}}><Plus size={16}/>{text("เพิ่ม Step","Add step")}</button>
    <p className="mission-verification"><ShieldCheck size={17}/>{text("ยืนยันบอทเป็นขั้นตอนสุดท้าย ผ่านแล้วรับคีย์ได้ทันที ไม่มีเวลารอเพิ่ม","Human verification stays last. Claim your key immediately after passing, with no additional wait.")}</p>
    <p className="link-warning">{text("การเปลี่ยน Step หรือเวลารอจะให้ผู้ที่ยังไม่ได้รับคีย์ทำขั้นตอนที่เปลี่ยนใหม่ คีย์ที่รับไปแล้วยังใช้งานได้ตามเดิม","Changed steps or wait times must be completed again by users who have not claimed a key. Existing keys keep their expiry.")}</p>
    {error&&<p className="settings-error" role="alert">{error}</p>}
    {saved&&<p className="settings-success" role="status"><Check size={14}/>{text("บันทึกเรียบร้อยแล้ว","Settings saved")}</p>}
    <button className="primary-button" disabled={busy}>{busy?<Loader2 className="spin" size={16}/>:<Save size={16}/>} {text("บันทึก","Save")} {mode.toUpperCase()}</button>
    <p className="settings-saved-at">{active.updatedAt?date(active.updatedAt,language):text("ค่าเริ่มต้นจากระบบ","System defaults")}</p>
  </form>;
}
