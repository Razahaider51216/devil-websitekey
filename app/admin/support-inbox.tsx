"use client";
import { useEffect,useState } from "react";
import { MessageSquare,RefreshCw,ArrowLeft } from "lucide-react";
import { ChatConversation,chatApi,type SupportThread } from "../support-chat";
import { useLanguage } from "../language";
export function SupportInbox() {
  const {language} = useLanguage();const text=(th:string,en:string)=>language==="th"?th:en;
  const [threads,setThreads]=useState<SupportThread[]>([]),[selected,setSelected]=useState<SupportThread|null>(null),[error,setError]=useState(""),[next,setNext]=useState<number|null>(null);
  async function load(before?:number) {
    try { const data=await chatApi<{threads:SupportThread[];next:number|null}>("admin/support/threads"+(before?"?before="+before:""));setThreads(old=>[...new Map([...old,...data.threads].map(thread=>[thread.id,thread])).values()].sort((a,b)=>b.updatedAt-a.updatedAt));setNext(data.next);setError(""); }
    catch(e){setError((e as Error).message);}
  }
  useEffect(()=>{void load();const timer=window.setInterval(()=>{if(!document.hidden)void load();},10_000);return()=>window.clearInterval(timer);},[]);
  return <section className="support-inbox"><div className="manager-top"><h2><MessageSquare size={20}/> {text("ช่องแชทผู้ใช้","Support inbox")}</h2><button className="quiet-button" onClick={()=>void load()}><RefreshCw size={15}/>{text("รีเฟรช","Refresh")}</button></div>
    {error&&<div className="notice error" role="alert">{error}</div>}
    <div className={`support-inbox-grid ${selected?"has-selection":""}`}><div className="support-thread-list">
      {!threads.length&&<p className="support-empty">{text("ยังไม่มีข้อความจากผู้ใช้","No conversations yet.")}</p>}
      {threads.map(thread=><button className={`support-thread ${selected?.id===thread.id?"selected":""}`} key={thread.id} onClick={()=>setSelected(thread)}><strong>{thread.name}{thread.unread&&<i aria-label={text("ยังไม่ได้อ่าน","Unread")}/>}</strong><span>{thread.preview}</span><time>{new Date(thread.updatedAt).toLocaleString(language==="th"?"th-TH":"en-US")}</time></button>)}
      {next&&<button className="quiet-button" onClick={()=>void load(next)}>{text("โหลดเพิ่มเติม","Load more")}</button>}
    </div><div className="support-inbox-detail">{selected?<><div className="support-selected"><button className="support-icon-button" aria-label={text("กลับรายชื่อแชท","Back to conversations")} onClick={()=>setSelected(null)}><ArrowLeft size={18}/></button><strong>{selected.name}</strong><small>PRIVATE CONVERSATION</small></div><ChatConversation key={selected.id} path={"admin/support/threads/"+selected.id} admin/></>:<div className="support-empty"><MessageSquare size={32}/><p>{text("เลือกแชทเพื่ออ่านและตอบกลับ","Select a conversation to read and reply.")}</p></div>}</div></div>
  </section>;
}
