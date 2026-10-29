"use client";
import { useEffect, useRef, useState } from "react";
import { Check, LockKeyhole, ShieldCheck } from "lucide-react";
import { useLanguage } from "./language";

type Widget = { render: (node: HTMLElement, options: Record<string, unknown>) => string; remove: (id: string) => void; reset: (id: string) => void };
declare global { interface Window { turnstile?: Widget } }
let loading: Promise<void> | null = null;
function loadWidget() {
  if (window.turnstile) return Promise.resolve();
  if (!loading) loading = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"; script.async = true;
    script.onload = () => resolve(); script.onerror = () => { script.remove(); loading = null; reject(new Error("widget unavailable")); };
    document.head.appendChild(script);
  });
  return loading;
}
export function TurnstileStep({ siteKey, challenge, passed, unlocked, onVerify, action = "devil-key-claim", stepNumber = 5 }: { siteKey: string; challenge: string; passed: boolean; unlocked: boolean; onVerify: (token: string) => Promise<void>; action?: "devil-key-claim" | "devil-key-login"; stepNumber?: number }) {
  const { t, language } = useLanguage();
  const node = useRef<HTMLDivElement>(null), verify = useRef(onVerify);
  verify.current = onVerify;
  const [failed, setFailed] = useState(false), [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!unlocked || passed || !siteKey) return;
    let cancelled = false, id: string | undefined;
    let container: HTMLDivElement | null = null;
    const reset = () => {
      if (cancelled || !id) return;
      try { window.turnstile?.reset(id); }
      catch { setFailed(true); }
    };
    setFailed(false);
    loadWidget().then(() => {
      if (cancelled || !node.current || !window.turnstile) return;
      container = node.current;
      id = window.turnstile.render(container, { sitekey: siteKey, theme: "dark", language, size: "flexible", action, cData: challenge,
        callback: (token: string) => { if (!cancelled) void verify.current(token).catch(reset); },
        "error-callback": () => { if (!cancelled) setFailed(true); },
        "expired-callback": reset,
      });
    }).catch(() => { if (!cancelled) setFailed(true); });
    return () => {
      cancelled = true;
      // The SDK can already have removed an expired/replaced widget. Cleanup
      // must never throw into React and replace the entire key portal.
      try { if (id) window.turnstile?.remove(id); }
      catch { /* Already disposed: the server verification remains authoritative. */ }
      finally { container?.replaceChildren(); }
    };
  }, [siteKey, challenge, passed, unlocked, language, retry, action]);
  return <article className={`bot-step ${passed ? "step-done" : ""}`}>
    <div className="eyebrow">{action === "devil-key-login" ? "SECURITY CHECK" : `STEP ${String(stepNumber).padStart(2, "0")}`} / <ShieldCheck size={14}/></div>
    <h3>{t("ยืนยันว่าไม่ใช่บอท")}</h3>
    <p>{t(action === "devil-key-login" ? "ยืนยันก่อนเข้าสู่ระบบ" : "ผ่านการยืนยันแล้วรับคีย์ได้ทันที ไม่ต้องรอเวลา")}</p>
    {passed ? <span className="done-label"><Check size={14}/>{t("เรียบร้อย")}</span> : !unlocked ? <span className="private-note"><LockKeyhole size={14}/>{t("กรุณาทำขั้นตอนก่อนหน้าให้ครบ")}</span> : !siteKey ? <p>{t("ยังไม่ได้ตั้งค่าระบบยืนยันว่าไม่ใช่บอท")}</p> : <div ref={node}/>}
    {failed && <button type="button" className="quiet-button" onClick={() => setRetry(v => v + 1)}>{t("ลองอีกครั้ง")}</button>}
  </article>;
}
