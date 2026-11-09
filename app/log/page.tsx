"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Activity, Copy, Check, RefreshCw, Link2, PackageOpen, Radio } from "lucide-react";
import Link from "next/link";
import { Header, Footer, api } from "../components";
import { useLanguage } from "../language";
import { formatLogAmount, logGames, type LogGame, type LogItem } from "../../lib/script-log-domain";
import "./log.css";
type Session = {id:string;game:LogGame;player:string;balance:string|null;lastSeenAt:number;online:boolean};
type Entry = {id:number;sessionId:string;game:LogGame;player:string;item:LogItem;balance:string|null;createdAt:number};
function ItemImage({game}:{game:LogGame}) {
  return <div className="log-item-image"><img src={logGames[game].image} alt={logGames[game].name} loading="lazy"/></div>;
}
export default function LogPage() {
  const {language}=useLanguage(), th=language==="th";
  const [link,setLink]=useState(""),[entries,setEntries]=useState<Entry[]>([]),[sessions,setSessions]=useState<Session[]>([]);
  const [filter,setFilter]=useState<LogGame|"all">("all"),[error,setError]=useState(""),[loading,setLoading]=useState(true),[copied,setCopied]=useState(false),[busy,setBusy]=useState(false);
  const [clock,setClock]=useState(0);const cursor=useRef(0),inflight=useRef(false),alive=useRef(true),retryAt=useRef(0);
  const refresh=useCallback(async()=>{
    if(inflight.current || Date.now()<retryAt.current)return;
    inflight.current=true;
    try {
      const data=await api("log?after="+cursor.current);
      if(!alive.current)return;
      setClock(Date.now());setSessions(data.sessions);setEntries(old=>{
        const retained=typeof data.historyStartedAt==="number"?old.filter(x=>x.createdAt>=data.historyStartedAt):data.historyStartedAt===null?[]:old;
        const values=new Map(retained.map(x=>[x.id,x]));for(const x of data.events)values.set(x.id,x);
        return [...values.values()].sort((a,b)=>b.id-a.id).slice(0,500);
      });cursor.current=data.cursor;setError("");retryAt.current=0;
    }catch(e){if(alive.current){setError((e as Error).message);retryAt.current=Date.now()+15000;}}
    finally{inflight.current=false;if(alive.current)setLoading(false);}
  },[]);
  useEffect(()=>{
    alive.current=true;const initial=setTimeout(()=>void refresh(),0);
    api("log/link",{method:"POST",body:"{}"}).then(v=>{if(alive.current)setLink(v.url);}).catch(e=>{if(alive.current)setError(e.message);});
    const id=setInterval(()=>{setClock(Date.now());if(document.visibilityState==="visible")void refresh();},2000);
    const focus=()=>{if(document.visibilityState==="visible")void refresh();};window.addEventListener("focus",focus);
    return()=>{alive.current=false;clearTimeout(initial);clearInterval(id);window.removeEventListener("focus",focus);};
  },[refresh]);
  async function rotate(){if(!window.confirm(th?"เปลี่ยนลิงก์ LOG? ลิงก์เดิมจะหยุดรับข้อมูล ต้องใส่ลิงก์ใหม่ใน Script ทุกเครื่อง":"Replace your LOG link? Update the new link in every running script."))return;setBusy(true);
    try{const v=await api("log/link",{method:"POST",body:JSON.stringify({rotate:true})});setLink(v.url);setCopied(false);}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
  async function copy(){try{await navigator.clipboard.writeText(link);setCopied(true);setTimeout(()=>setCopied(false),2000);}catch{setError(th?"เลือกและคัดลอกลิงก์จากช่องด้านล่างได้เลย":"Select and copy the link in the field below.");}}
  const visible=entries.filter(e=>filter==="all"||e.game===filter),active=sessions.filter(s=>clock-s.lastSeenAt<45000);
  return <><Header active="log"/><main className="log-page">
    <div className="log-heading"><div><span className="log-eyebrow"><Radio size={14}/> DEVIL HUB / LIVE LOG</span><h1>{th?"สิ่งที่ได้รับ ทั้งหมดในที่เดียว":"Your drops. One live feed."}</h1><p>{th?"เชื่อม Script กับบัญชีของคุณ แล้วติดตามสัตว์และตัวละครที่ได้รับโดยอัตโนมัติ":"Connect your script and watch newly obtained animals and characters appear here."}</p></div><span className="log-live"><i/>{th?"อัปเดตอัตโนมัติ":"LIVE UPDATES"}</span></div>
    <section className="log-connect"><div><Link2 size={20}/><h2>{th?"ลิงก์ LOG ของคุณ":"Your LOG link"}</h2></div>
      <p>{th?"คัดลอกไปใส่ในเมนู LOG ของ Script แล้วเปิด Enable LOG ใช้ลิงก์เดียวกันได้ทั้ง 3 แมพ":"Paste this link into the script’s LOG menu, then enable LOG. One link works across all three games."}</p>
      <div className="log-link-row"><input aria-label="LOG link" type="password" readOnly value={link} placeholder={th?"ล็อกอินเพื่อรับลิงก์ส่วนตัว":"Sign in to get your private link"} onFocus={e=>e.target.select()}/><button disabled={!link} onClick={copy}>{copied?<Check size={16}/>:<Copy size={16}/>} {copied?(th?"คัดลอกแล้ว":"Copied"):(th?"คัดลอกลิงก์":"Copy link")}</button><button className="log-secondary" disabled={busy||!link} onClick={rotate}><RefreshCw size={15}/><span>{th?"เปลี่ยนลิงก์":"Replace link"}</span></button></div>
      <small>{th?"ลิงก์นี้ใช้ส่งข้อมูลเข้าบัญชีของคุณ เก็บไว้ส่วนตัว • แสดงเฉพาะของที่ได้รับหลังเปิด LOG":"Keep this write-only link private. The feed starts with new drops after LOG is enabled."}</small>
    </section>
    {error&&<div role="alert" className="notice error">{error} <Link href="/">{th?"กลับหน้าล็อกอิน":"Go to sign in"}</Link></div>}
    <section className="log-sessions" aria-label="Connected games">{sessions.length?sessions.map(s=><article key={s.id} className="log-session"><img src={logGames[s.game].image} alt=""/><div><h3>{logGames[s.game].name}</h3><p>{s.player}</p><strong>{logGames[s.game].currency} · {formatLogAmount(s.balance)}</strong></div><span className={clock-s.lastSeenAt<45000?"log-online":"log-offline"}>{clock-s.lastSeenAt<45000?(th?"เชื่อมต่อแล้ว":"Connected"):(th?"ออฟไลน์":"Offline")}</span></article>):<div className="log-wait"><Activity size={22}/><div><strong>{th?"รอการเชื่อมต่อจาก Script":"Waiting for your script"}</strong><p>{th?"ชื่อและรูปแมพจะปรากฏเมื่อเปิด LOG ในเกม":"The game name and artwork appear as soon as LOG connects."}</p></div></div>}</section>
    <div className="log-toolbar"><div><h2>DROP FEED</h2><span>{active.length} {th?"เซสชันออนไลน์":"sessions online"}</span></div><select aria-label={th?"เลือกแมพ":"Filter game"} value={filter} onChange={e=>setFilter(e.target.value as LogGame|"all")}><option value="all">{th?"ทุกแมพ":"All games"}</option>{Object.entries(logGames).map(([k,g])=><option value={k} key={k}>{g.name}</option>)}</select></div>
    <div className="log-feed" aria-live="polite" aria-relevant="additions">{visible.length?visible.map(e=><article key={e.id} className="log-entry"><ItemImage game={e.game}/><div className="log-item-body"><div className="log-item-title"><h3>{e.item.name}</h3><span>×{e.item.amount}</span></div><div className="log-badges">{e.item.rarity&&<span className="log-rarity">{e.item.rarity}</span>}{e.item.level!==null&&<span>Lv. {e.item.level}</span>}{e.item.statuses.map(s=><span key={s}>{s}</span>)}</div><p>{logGames[e.game].name} <span>· {e.player}</span></p></div><div className="log-entry-meta">{e.item.income!==null&&<strong>+{formatLogAmount(e.item.income)}/s</strong>}<span>{logGames[e.game].currency} {formatLogAmount(e.balance)}</span><time dateTime={new Date(e.createdAt).toISOString()}>{new Intl.DateTimeFormat(language==="th"?"th-TH":"en-GB",{dateStyle:"short",timeStyle:"medium"}).format(e.createdAt)}</time></div></article>):<div className="log-empty"><PackageOpen size={38}/><h3>{loading?(th?"กำลังโหลด LOG":"Loading LOG"):(th?"ยังไม่มีของที่ได้รับ":"No new drops yet")}</h3><p>{th?"เปิด LOG ใน Script แล้วเริ่มเล่น ของที่ได้รับใหม่จะแสดงที่นี่":"Enable LOG in your script and start playing. New drops will show up here."}</p></div>}</div>
    <p className="log-retention">{th?"แสดงล่าสุด 500 รายการ • ล้างประวัติทั้งหมดเมื่อ Script ทุกแมพออฟไลน์เกิน 1 ชั่วโมง • ตั้งค่าตัวกรองเงินและระดับได้ในเมนู LOG ของ Script":"Showing the latest 500 entries · History clears after all script sessions are offline for over 1 hour · Set money and rarity filters in your script's LOG menu"}</p>
  </main><Footer/></>;
}
