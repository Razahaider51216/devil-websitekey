"use client";
import { Check, Copy, KeyRound, ArrowUpRight, ShieldCheck } from "lucide-react";
import { createContext, useContext, useState } from "react";
import { LanguageSwitch, useLanguage } from "./language";
import type { Language } from "../lib/translations";

export function Brand() { return <a className="brand" href="/" aria-label="DEVIL KEY home"><span className="brand-mark"><img src="/devilhubv3.png" alt="DEVIL HUB" width={48} height={40}/></span><span>DEVIL<span className="brand-light"> KEY</span><small>OFFICIAL ACCESS PORTAL</small></span></a>; }
export const AdminVisibility = createContext(false);
export function Header({ admin = false, active = "keys" }: { admin?: boolean; active?: "keys" | "games" }) {
  const { t } = useLanguage();
  const showAdmin = useContext(AdminVisibility);
  return <header className="topbar"><div className="topbar-inner"><Brand/><nav><a className={!admin && active === "keys" ? "nav-active" : ""} href="/">{t("รับคีย์")} <span>GET ACCESS</span></a><a className={active === "games" ? "nav-active" : ""} href="/games">{t("แมพที่รองรับ")}</a><a href="/#how-to">{t("วิธีใช้งาน")}</a></nav><div className="header-actions"><LanguageSwitch/>{(admin || showAdmin) && <a className="admin-link" href={admin ? "/" : "/admin"}>{admin ? <KeyRound size={15}/> : <ShieldCheck size={15}/>} {admin ? t("กลับหน้ารับคีย์") : "ADMIN"}<ArrowUpRight size={13}/></a>}</div></div></header>;
}
export function Footer() { return <footer className="footer"><span>© {new Date().getFullYear()} DEVIL HUB<span className="footer-slash">/</span> BUILT FOR THE NEXT LEVEL.</span><span className="mono"><i className="status-dot"/> DEVIL KEY · ACCESS SYSTEM</span></footer>; }
export function CopyButton({ value, label }: { value: string; label?: string }) {
  const { t } = useLanguage();
  const [copied, setCopied] = useState(false), [manual, setManual] = useState(false);
  async function copy() { try { await navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 2200); } catch { setManual(true); } }
  return <><button type="button" className="copy-button" onClick={copy}>{copied ? <Check size={17}/> : <Copy size={17}/>} {copied ? t("คัดลอกแล้ว") : label || t("คัดลอกคีย์")}</button>{manual && <input aria-label={t("เลือกคีย์เพื่อคัดลอก")} className="manual-copy" readOnly value={value} onFocus={e => e.target.select()} autoFocus/>}</>;
}
export function date(value: number | null, language: Language = "th") { return value === null ? (language === "en" ? "Never expires" : "ไม่มีวันหมดอายุ") : new Intl.DateTimeFormat(language === "en" ? "en-GB" : "th-TH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Bangkok" }).format(value); }
export async function api(path: string, options?: RequestInit) {
  const response = await fetch(`/api/${path}`, { ...options, headers: { "Content-Type": "application/json", ...options?.headers }, cache: "no-store" });
  const data: any = await response.json(); if (!response.ok) throw new Error(data.error || "ทำรายการไม่สำเร็จ"); return data;
}
