"use client";
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { ImagePlus, Loader2, MessageSquare, Send, X } from "lucide-react";
import { useLanguage } from "./language";

export type SupportThread = { id:string; name:string; avatarUrl?:string|null;provider?:string|null;preview:string; updatedAt:number; unread:boolean };
type Message = { id:number; role:string; text:string; imageUrl:string|null; createdAt:number;author?:{name:string;avatarUrl:string|null;provider:string|null} };
type Conversation = { thread:SupportThread|null;messages:Message[];hasOlder:boolean;hasMore:boolean };
export function ChatAvatar({name,src}:{name:string;src?:string|null}) {
  const [failed,setFailed]=useState(false);useEffect(()=>setFailed(false),[src]);
  return <span className="support-avatar">{src&&!failed ? <img src={src} alt={name} referrerPolicy="no-referrer" onError={()=>setFailed(true)}/> : <span aria-label={name}>{name.slice(0,1).toLocaleUpperCase()}</span>}</span>;
}
export async function chatApi<T = unknown>(path:string, init:RequestInit = {}):Promise<T> {
  const response = await fetch("/api/"+path, { ...init, credentials:"same-origin", cache:"no-store",
    headers:typeof init.body === "string" ? { "Content-Type":"application/json" } : undefined });
  const data = await response.json() as { error?:string };if (!response.ok) throw Object.assign(new Error(data.error || "Chat unavailable"), { status:response.status });
  return data as T;
}
async function prepareImage(file:File) {
  if (file.size <= 4*1024*1024 && ["image/png","image/jpeg","image/webp"].includes(file.type)) return file;
  if (file.size > 20*1024*1024) throw new Error("Image exceeds 20 MiB");
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1,1600/Math.max(bitmap.width,bitmap.height));
    const canvas = document.createElement("canvas");canvas.width = Math.max(1,Math.round(bitmap.width*scale));canvas.height = Math.max(1,Math.round(bitmap.height*scale));
    const context = canvas.getContext("2d");if (!context) throw new Error("Image unavailable");
    context.fillStyle = "#fff";context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(bitmap,0,0,canvas.width,canvas.height);
    const blob = await new Promise<Blob>((resolve,reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error("Image unavailable")),"image/jpeg",.86));
    if (blob.size > 4*1024*1024) throw new Error("Image exceeds 4 MiB");
    return new File([blob],"support.jpg",{ type:"image/jpeg" });
  } finally { bitmap.close(); }
}
export function ChatConversation({ path, admin = false }: { path:string; admin?:boolean }) {
  const { language } = useLanguage();const text = (th:string,en:string) => language === "th" ? th : en;
  const [messages,setMessages] = useState<Message[]>([]), [draft,setDraft] = useState(""), [file,setFile] = useState<File|null>(null);
  const [preview,setPreview] = useState(""), [busy,setBusy] = useState(false), [error,setError] = useState(""), [loading,setLoading] = useState(true), [login,setLogin] = useState(false);
  const list = useRef<HTMLDivElement>(null), fileInput = useRef<HTMLInputElement>(null), clientId = useRef("");
  const cursor = useRef(0), read = useRef(0), nearBottom = useRef(true);
  const currentThread = useRef<string|null>(null);
  const [older,setOlder] = useState(false), [olderBusy,setOlderBusy] = useState(false);
  const merge = (incoming:Message[]) => setMessages(old => [...new Map([...old,...incoming].map(message => [message.id,message])).values()].sort((a,b) => a.id-b.id));
  useEffect(() => {
    let stopped = false, polling = false;
    async function poll() {
      if (polling || document.hidden) return;polling = true;
      try {
        const data = await chatApi<Conversation>(path + (cursor.current ? "?after="+cursor.current : ""));
        if (stopped) return;
        if (currentThread.current && data.thread?.id !== currentThread.current) {
          currentThread.current=data.thread?.id || null;cursor.current=0;read.current=0;setMessages([]);setDraft("");setFile(null);return;
        }
        currentThread.current=data.thread?.id || null;
        if (!cursor.current) setOlder(data.hasOlder);merge(data.messages);setLogin(false);setError("");
        if (data.messages.length) cursor.current = Math.max(cursor.current,...data.messages.map((message:Message) => message.id));
        if (cursor.current > read.current && !document.hidden) {
          await chatApi(path.replace(/\/thread$/, "/read") + (admin ? "/read" : ""),{ method:"POST",body:JSON.stringify({ through:cursor.current }) });
          if (!stopped) read.current = cursor.current;
        }
      } catch (e) { if (!stopped) { const unauthorized=(e as {status?:number}).status === 401;setLogin(unauthorized);setError((e as Error).message);
        if (unauthorized) { setMessages([]);setDraft("");setFile(null);cursor.current=0;read.current=0;currentThread.current=null; }
      } }
      finally { polling = false;if (!stopped) setLoading(false); }
    }
    void poll();const timer = window.setInterval(poll,4000);document.addEventListener("visibilitychange",poll);
    return () => { stopped = true;window.clearInterval(timer);document.removeEventListener("visibilitychange",poll); };
  },[path,admin]);
  useEffect(() => { if (nearBottom.current) list.current?.scrollTo({ top:list.current.scrollHeight,behavior:"smooth" }); },[messages]);
  useEffect(() => { if (!file) { setPreview("");return; }const url = URL.createObjectURL(file);setPreview(url);return () => URL.revokeObjectURL(url); },[file]);
  async function attach(value:File|undefined) {
    if (!value) return;setError("");setBusy(true);
    try { setFile(await prepareImage(value));clientId.current = ""; } catch { setError(text("แนบรูปไม่สำเร็จ ใช้ PNG, JPEG หรือ WebP ขนาดไม่เกิน 4 MB","Use a PNG, JPEG or WebP image up to 4 MB.")); }
    finally { setBusy(false);if (fileInput.current) fileInput.current.value = ""; }
  }
  async function send(e:React.FormEvent) {
    e.preventDefault();if (busy || !draft.trim() && !file) return;setBusy(true);setError("");
    try {
      if (!clientId.current) clientId.current = crypto.randomUUID();
      const body = new FormData();body.set("text",draft);body.set("clientId",clientId.current);if (file) body.set("image",file);
      const data = await chatApi<{message:Message}>(path,{ method:"POST",body });nearBottom.current = true;merge([data.message]);
      setDraft("");setFile(null);clientId.current = "";
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  async function loadOlder() {
    if (!messages.length || olderBusy) return;setOlderBusy(true);nearBottom.current=false;
    try { const data = await chatApi<Conversation>(path+"?before="+messages[0].id);merge(data.messages);setOlder(data.hasOlder); }
    catch(e) { setError((e as Error).message); } finally { setOlderBusy(false); }
  }
  return <div className="support-conversation">
    <div className="support-messages" ref={list} role="log" aria-live="polite" onScroll={() => { const element = list.current;if (element) nearBottom.current = element.scrollHeight-element.scrollTop-element.clientHeight < 100; }}>
      {loading && <Loader2 className="spin" size={20}/>}
      {older && <button className="quiet-button" disabled={olderBusy} onClick={() => void loadOlder()}>{text("ข้อความก่อนหน้า","Earlier messages")}</button>}
      {!loading && !messages.length && !login && <div className="support-empty"><MessageSquare size={30}/><strong>{text("ต้องการความช่วยเหลือ?","Need help?")}</strong><p>{text("ส่งข้อความหรือรูปให้แอดมินได้ที่นี่","Send a message or screenshot to the admin.")}</p></div>}
      {messages.map(message => {
        const name=message.author?.name || (message.role === "admin" ? "DEVIL HUB" : text("ผู้ใช้","User"));
        const own=admin ? message.role === "admin" : message.role !== "admin";
        return <article className={`support-message-row ${message.role === "admin" ? "from-admin" : "from-user"} ${own?"is-own":""}`} key={message.id}>
          <ChatAvatar name={name} src={message.role === "admin" ? "/devilhubv3.png" : message.author?.avatarUrl}/><div className="support-message-content">
            <div className="support-message-author"><strong title={name}>{name}</strong>{message.author?.provider&&<small>{message.author.provider.toUpperCase()}</small>}{message.role==="admin"&&<b>ADMIN</b>}</div>
            <div className="support-message">{message.text && <p>{message.text}</p>}{message.imageUrl && <a href={message.imageUrl} target="_blank" rel="noopener noreferrer"><img src={message.imageUrl} alt={text("รูปแนบในแชท","Chat attachment")} loading="lazy"/></a>}</div>
            <time className="support-message-time" dateTime={new Date(message.createdAt).toISOString()}>{new Date(message.createdAt).toLocaleString(language === "th" ? "th-TH" : "en-US",{ month:"short",day:"numeric",hour:"2-digit",minute:"2-digit" })}</time>
          </div>
        </article>;
      })}
    </div>
    {error && <div className="support-error" role="alert">{login ? <a href="/">{text("เข้าสู่ระบบก่อนเริ่มแชท","Sign in to start chatting")}</a> : error}</div>}
    {!login && <form className="support-composer" onSubmit={send}>
      {preview && <div className="support-attachment"><img src={preview} alt=""/><button type="button" aria-label={text("ลบรูป","Remove image")} disabled={busy} onClick={() => { setFile(null);clientId.current=""; }}><X size={14}/></button></div>}
      <textarea rows={1} aria-label={text("ข้อความถึงแอดมิน","Message to admin")} placeholder={text("พิมพ์ข้อความ…","Type a message…")} maxLength={2000} value={draft} disabled={busy} onChange={e => { setDraft(e.target.value);clientId.current=""; }}/>
      <div className="support-composer-actions"><input hidden type="file" ref={fileInput} accept="image/png,image/jpeg,image/webp" onChange={e => void attach(e.target.files?.[0])}/>
        <button type="button" className="support-icon-button" title={text("แนบรูป","Attach image")} aria-label={text("แนบรูป","Attach image")} disabled={busy} onClick={() => fileInput.current?.click()}><ImagePlus size={19}/></button><small>PNG / JPG / WEBP · 4 MB</small>
        <button type="submit" className="support-send" disabled={busy || !draft.trim() && !file} aria-label={text("ส่งข้อความ","Send message")}>{busy ? <Loader2 size={17} className="spin"/> : <Send size={17}/>}</button>
      </div>
    </form>}
  </div>;
}
export function SupportChat() {
  const pathname = usePathname(), {language} = useLanguage();const [open,setOpen] = useState(false);const button = useRef<HTMLButtonElement>(null);
  useEffect(() => { const close = (e:KeyboardEvent) => { if (e.key === "Escape") { setOpen(false);button.current?.focus(); } };window.addEventListener("keydown",close);return () => window.removeEventListener("keydown",close); },[]);
  if (pathname?.startsWith("/admin")) return null;
  return <aside className="support-widget">
    {open && <section id="devil-support-chat" className="support-panel" role="dialog" aria-label="DEVIL HUB Support">
      <header><div><img className="support-brand-logo" src="/devilhubv3.png" alt="DEVIL HUB" width={34} height={28}/><span><strong>DEVIL HUB</strong><small>ADMIN SUPPORT // v1.1.0</small></span></div><button className="support-icon-button" aria-label={language === "th" ? "ปิดแชท" : "Close chat"} onClick={() => { setOpen(false);button.current?.focus(); }}><X size={20}/></button></header>
      <ChatConversation path="support/thread"/>
    </section>}
    <button ref={button} className="support-launcher" aria-expanded={open} aria-controls="devil-support-chat" aria-label={language === "th" ? "แชทกับแอดมิน" : "Chat with admin"} onClick={() => setOpen(!open)}>{open ? <X size={24}/> : <MessageSquare size={24}/>}</button>
  </aside>;
}
