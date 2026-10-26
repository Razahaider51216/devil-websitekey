"use client";
import { Check, Copy, KeyRound, ArrowUpRight, ShieldCheck } from "lucide-react";
import { useState } from "react";
export function Brand() { return <a className="brand" href="/" aria-label="DEVIL KEY home"><span className="brand-mark"><svg viewBox="0 0 32 32" fill="none"><path d="M5 3l8 6h6l8-6-3 13-8 12-8-12L5 3z" stroke="currentColor" strokeWidth="2"/><path d="M10 14l4 3m8-3l-4 3m-5 5h6" stroke="currentColor" strokeWidth="2"/></svg></span><span>DEVIL<span className="brand-light"> KEY</span><small>OFFICIAL ACCESS PORTAL</small></span></a>; }
export function Header({ admin = false }: { admin?: boolean }) { return <header className="topbar"><div className="topbar-inner"><Brand/><nav><a className={!admin ? "nav-active" : ""} href="/">รับคีย์ <span>GET ACCESS</span></a><a href="/#how-to">วิธีใช้งาน</a></nav><a className="admin-link" href={admin ? "/" : "/admin"}>{admin ? <KeyRound size={15}/> : <ShieldCheck size={15}/>} {admin ? "กลับหน้ารับคีย์" : "ADMIN"}<ArrowUpRight size={13}/></a></div></header>; }
export function Footer() { return <footer className="footer"><span>© {new Date().getFullYear()} DEVIL HUB<span className="footer-slash">/</span> BUILT FOR THE NEXT LEVEL.</span><span className="mono"><i className="status-dot"/> DEVIL KEY · ACCESS SYSTEM</span></footer>; }
export function CopyButton({ value, label = "คัดลอกคีย์" }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false), [manual, setManual] = useState(false);
  async function copy() { try { await navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 2200); } catch { setManual(true); } }
  return <><button className="copy-button" onClick={copy}>{copied ? <Check size={17}/> : <Copy size={17}/>} {copied ? "คัดลอกแล้ว" : label}</button>{manual && <input aria-label="เลือกคีย์เพื่อคัดลอก" className="manual-copy" readOnly value={value} onFocus={e => e.target.select()} autoFocus/>}</>;
}
export function date(value: number | null) { return value === null ? "ไม่มีวันหมดอายุ" : new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Bangkok" }).format(value); }
export async function api(path: string, options?: RequestInit) {
  const response = await fetch(`/api/${path}`, { ...options, headers: { "Content-Type": "application/json", ...options?.headers }, cache: "no-store" });
  const data: any = await response.json(); if (!response.ok) throw new Error(data.error || "ทำรายการไม่สำเร็จ"); return data;
}
