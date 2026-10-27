"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight, ArrowUpRight, Check, ChevronRight, Clock3, KeyRound, LockKeyhole, MessageSquare, ShieldCheck, ThumbsUp, Play, Loader2, Terminal } from "lucide-react";
import { Header, Footer, api, date } from "./components";
import { useLanguage } from "./language";
import { KeyCountdown } from "./key-countdown";
import { remainingKeyTime } from "../lib/countdown";
import { KeyOutput } from "./key-output";
import { TurnstileStep } from "./turnstile-step";
type Key = { key: string; expiresAt: number | null; status: string };
type Step = { number: number; title: string; subtitle: string; service: string; configured: boolean; status: string; deadline: number | null };
type Bot = { enabled: boolean; configured: boolean; siteKey: string; challenge: string; passed: boolean };
type Flow = { turnstile?: Bot; serverNow: number; lifetimeHours: number; steps: Step[]; canClaim: boolean; key: Key | null };
function DiscordIcon() { return <svg viewBox="0 0 24 24" width="23" height="23" fill="currentColor" aria-hidden="true"><path d="M19.7 5.1a18 18 0 00-4.4-1.4l-.6 1.2a16 16 0 00-5.4 0l-.6-1.2a18 18 0 00-4.4 1.4C1.6 9.1.8 13 .9 16.8A18 18 0 006.3 19l1.1-1.8-1.7-.8.4-.3a13.8 13.8 0 0011.8 0l.4.3-1.7.8 1.1 1.8a18 18 0 005.4-2.2c.2-4.5-.8-8.3-3.4-11.7zM8.4 14.2c-1 0-1.8-.9-1.8-2s.8-2 1.8-2 1.8.9 1.8 2-.8 2-1.8 2zm7.2 0c-1 0-1.8-.9-1.8-2s.8-2 1.8-2 1.8.9 1.8 2-.8 2-1.8 2z"/></svg>; }
const icons = [DiscordIcon, Play, MessageSquare, ThumbsUp];
export default function Home() {
  const { t, language } = useLanguage();
  const [flow, setFlow] = useState<Flow | null>(null), [error, setError] = useState(""), [busy, setBusy] = useState<number | string | null>(null), [clock, setClock] = useState(Date.now());
  const offset = useRef(0), returning = useRef(false), fresh = useRef<Flow | null>(null);
  const apply = useCallback((value: Flow) => { offset.current = value.serverNow - Date.now(); fresh.current = value; setClock(Date.now()); setFlow(value); }, []);
  const refresh = useCallback(async () => { try { apply(await api("flow")); } catch (e) { setError((e as Error).message); } }, [apply]);
  const returned = useCallback(async () => {
    const step = fresh.current?.steps.find(s => s.status === "opened"); if (!step || returning.current) return;
    returning.current = true;
    try { apply(await api("flow/return", { method: "POST", body: JSON.stringify({ step: step.number }) })); } catch (e) { setError((e as Error).message); } finally { returning.current = false; }
  }, [apply]);
  useEffect(() => {
    refresh(); const timer = setInterval(() => setClock(Date.now()), 500);
    const poll = setInterval(() => { if (document.visibilityState === "visible" && fresh.current?.steps.some(s => s.status === "waiting")) refresh(); }, 2500);
    const keyPoll = setInterval(() => { if (document.visibilityState === "visible" && fresh.current?.key) refresh(); }, 30000);
    const onFocus = () => { if (document.visibilityState === "visible") { setClock(Date.now()); if (fresh.current?.key) refresh(); else returned(); } };
    window.addEventListener("focus", onFocus); document.addEventListener("visibilitychange", onFocus);
    return () => { clearInterval(timer); clearInterval(poll); clearInterval(keyPoll); window.removeEventListener("focus", onFocus); document.removeEventListener("visibilitychange", onFocus); };
  }, [refresh, returned]);
  async function open(step: Step) {
    const tab = window.open("about:blank", "_blank"); if (tab) tab.opener = null;
    setBusy(step.number); setError("");
    try { const value = await api("flow/open", { method: "POST", body: JSON.stringify({ step: step.number }) }); apply(value); if (tab) tab.location.href = value.openedUrl; else { sessionStorage.setItem("devil-return", "1"); window.location.assign(value.openedUrl); } }
    catch (e) { tab?.close(); setError((e as Error).message); } finally { setBusy(null); }
  }
  useEffect(() => { if (flow && sessionStorage.getItem("devil-return")) { sessionStorage.removeItem("devil-return"); returned(); } }, [flow, returned]);
  async function claim() { setBusy("claim"); setError(""); try { const key = await api("flow/claim", { method: "POST", body: "{}" }); apply({ ...flow!, serverNow: Date.now() + offset.current, key }); } catch (e) { setError((e as Error).message); } finally { setBusy(null); } }
  const keyState = flow?.key ? remainingKeyTime(flow.key.expiresAt, flow.key.status, clock + offset.current).state : null;
  const completed = flow?.steps.filter(s => s.status === "done").length || 0;
  const totalSteps = flow?.turnstile?.enabled ? 5 : 4;
  const progress = completed + (flow?.turnstile?.enabled && flow.turnstile.passed ? 1 : 0);
  async function verifyBot(token: string) { setError(""); try { apply(await api("flow/verify", { method: "POST", body: JSON.stringify({ token }) })); } catch (e) { setError((e as Error).message); throw e; } }
  const current = flow?.steps.find(s => s.status !== "done")?.number || 5, granted = !!flow?.key;
  return <><Header/><main className="site-main"><section className="hero"><div className="hero-copy"><div className="eyebrow"><span className="red-square"/> DEVIL HUB / ACCESS PROTOCOL <span className="version">V.01</span></div>
    <h1>{granted ? <>ACCESS<br/><span>GRANTED.</span></> : <>YOUR ACCESS.<br/><span>YOUR NEXT LEVEL.</span></>}</h1>
    <p>{granted ? t("คีย์ของคุณพร้อมแล้ว คัดลอกและเก็บไว้สำหรับเข้าใช้งาน DEVIL HUB") : t("ทำภารกิจให้ครบ {steps} ขั้นตอน แล้วปลดล็อกคีย์สำหรับ DEVIL HUB", {steps:totalSteps})}<br/><span>{granted ? t("เริ่มต้นประสบการณ์ครั้งถัดไปได้เลย") : t("เข้าร่วมคอมมูนิตี้ สนับสนุนช่อง แล้วไปให้สุดด้วยกัน")}</span></p>
    <div className="hero-tags"><span><ShieldCheck size={14}/> OFFICIAL DEVIL HUB</span><span><Clock3 size={14}/> {t("30 วินาที / ขั้นตอน")}</span><span><KeyRound size={14}/> {flow?.lifetimeHours || 24}H ACCESS</span></div></div>
    <div className={`terminal-art ${granted ? "granted-art" : ""}`} aria-hidden="true"><div className="art-top"><span><i/> SECURE ACCESS TERMINAL</span><span>DK—001</span></div><div className="art-grid"/><div className="art-orbit orbit-one"/><div className="art-orbit orbit-two"/><div className="art-key"><KeyRound strokeWidth={1.1}/></div><span className="art-label label-a">AUTHENTICATION_REQUIRED</span><span className="art-label label-b">// ACCESS_LAYER_04</span><div className="art-bottom"><span><i className="status-dot"/> {granted ? "ACCESS GRANTED" : "AWAITING YOUR SIGNAL"}</span><span>256 / KEY</span></div></div></section>
    {error && <div className="notice error" role="alert">{t(error)}<button onClick={() => { setError(""); refresh(); }}>{t("ลองอีกครั้ง")}</button></div>}
    {granted ? <section className="key-layout"><div className="key-ticket"><div className="ticket-top"><span className="eyebrow"><Check size={15}/> AUTHENTICATION COMPLETE</span><span className="pill success">{(keyState === "active" || keyState === "permanent") ? t("พร้อมใช้งาน") : t("หมดอายุ / ถูกยกเลิก")}</span></div><div className="success-badge"><Check size={29}/></div><h2>YOUR KEY IS READY.</h2><p>{t("คีย์สำหรับการเข้าถึงครั้งต่อไปของคุณ")}</p><KeyOutput value={flow!.key!.key}/><KeyCountdown expiresAt={flow!.key!.expiresAt} status={flow!.key!.status} now={clock + offset.current}/><div className="ticket-meta"><span>{t("อายุการใช้งาน")}<strong>{flow!.lifetimeHours} {t("ชั่วโมง")}</strong></span><span>{t("หมดอายุ")}<strong>{date(flow!.key!.expiresAt, language)}</strong></span></div><p className="private-note"><LockKeyhole size={13}/> {t("เก็บคีย์นี้เป็นส่วนตัว และอย่าแชร์กับผู้อื่น")}</p></div><Usage/></section>
    : <section className="access-layout"><div className="steps-area"><div className="section-heading"><div><div className="eyebrow muted">THE CHECKLIST</div><h2>{t("{steps} ภารกิจ. 1 คีย์.", {steps:totalSteps})}</h2></div><span className="mono muted">{String(progress).padStart(2, "0")} / {String(totalSteps).padStart(2, "0")} COMPLETE</span></div><div className="steps-list">{flow ? flow.steps.map((step, i) => {
      const Icon = icons[i], done = step.status === "done", locked = step.number > current, active = step.number === current;
      const remaining = step.deadline ? Math.max(0, Math.ceil((step.deadline - (clock + offset.current)) / 1000)) : 30;
      return <article className={`step-row ${active ? "step-active" : ""} ${done ? "step-done" : ""} ${locked ? "step-locked" : ""}`} key={step.number}><div className="step-number">{done ? <Check size={16}/> : `0${step.number}`}</div><div className={`step-service service-${i}`}><Icon/></div><div className="step-text"><div className="step-kicker">STEP 0{step.number} <span>{step.service}</span></div><h3>{t(step.title)}</h3><p>{t(step.subtitle)}</p>{!step.configured && <span className="config-note">{t("รอแอดมินตั้งค่าลิงก์")}</span>}</div><div className="step-action">{done ? <span className="done-label"><Check size={14}/> {t("เรียบร้อย")}</span> : locked ? <LockKeyhole size={18}/> : step.status === "waiting" ? <div className="countdown"><Clock3 size={15}/><strong>{String(remaining).padStart(2, "0")}</strong><span>{t("วินาที")}</span></div> : step.status === "opened" ? <button className="return-button" onClick={returned}>{t("กลับมาแล้ว")} <ArrowRight size={14}/></button> : <button className="open-step" disabled={!step.configured || busy !== null} onClick={() => open(step)}>{busy === step.number ? <Loader2 className="spin" size={16}/> : <>{t("เริ่มภารกิจ")} <ArrowUpRight size={17}/></>}</button>}</div>{active && <div className="active-edge"/>}</article>;
    }) : Array.from({ length: 4 }, (_, i) => <div className="step-row skeleton" key={i}><span/><div/><p/></div>)}</div>{flow?.turnstile?.enabled && <TurnstileStep siteKey={flow.turnstile.siteKey} challenge={flow.turnstile.challenge} passed={flow.turnstile.passed} unlocked={completed === 4} onVerify={verifyBot}/>}<div className="process-note"><Terminal size={16}/><p>{t("เปิดลิงก์เพื่อทำภารกิจ แล้วกลับมารอคูลดาวน์ 30 วินาทีต่อขั้นตอน")}<br/><span>{t("ระบบตรวจการเปิดลิงก์และเวลา ไม่ได้ตรวจบัญชีโซเชียลของคุณ")}</span></p></div></div>
    <aside className="access-card"><div className="card-topline"><span className="eyebrow">YOUR ACCESS</span><LockKeyhole size={16}/></div><div className="access-plan"><KeyRound size={31}/><h3>STANDARD<span>ACCESS KEY</span></h3></div><div className="plan-duration"><span>{t("อายุคีย์")}</span><strong>{flow?.lifetimeHours || 24}<small> HOURS</small></strong></div><div className="progress-meta"><span>{t("ความคืบหน้าของคุณ")}</span><span>{progress}/{totalSteps}</span></div><div className="progress-track"><span style={{ width: `${progress / totalSteps * 100}%` }}/></div><div className="mini-checks">{[t("เข้าร่วมคอมมูนิตี้"), t("ติดตาม DEVIL HUB"), t("คอมเมนต์วิดีโอ"), t("กดไลค์วิดีโอ"), ...(flow?.turnstile?.enabled ? [t("ยืนยันว่าไม่ใช่บอท")] : [])].map((text,i) => <div key={text}><span className={i < progress ? "mini-done" : "mini-pending"}>{i < progress ? <Check size={12}/> : <span/>}</span>{text}</div>)}</div><button className="primary-button" disabled={!flow?.canClaim || busy !== null} onClick={claim}>{busy === "claim" ? <Loader2 size={18} className="spin"/> : flow?.canClaim ? <KeyRound size={18}/> : <LockKeyhole size={17}/>} {t("CONNECT / รับคีย์")} <ArrowRight size={17}/></button><p className="unlock-note">{flow?.canClaim ? t("ครบทุกขั้นตอนแล้ว รับคีย์ของคุณได้เลย") : t("ทำครบ {steps} ขั้นตอนเพื่อปลดล็อกปุ่ม", {steps:totalSteps})}</p><div className="card-bottom"><ShieldCheck size={14}/> GENERATED BY DEVIL KEY</div></aside></section>}
    {!granted && <Usage/>}</main><Footer/></>;
}
function Usage() { const { t } = useLanguage(); return <section id="how-to" className="usage"><div><span className="eyebrow muted">THE NEXT STEP</span><h2>{t("ได้คีย์แล้ว ใช้ยังไง?")}</h2><p>{t("สำหรับ DEVIL HUB เวอร์ชันที่รองรับระบบคีย์")}</p></div><ol><li><span>01</span><div><strong>{t("คัดลอกคีย์ของคุณ")}</strong><p>{t("กดปุ่มคัดลอกในหน้ารับคีย์")}</p></div></li><li><span>02</span><div><strong>{t("เปิด DEVIL HUB")}</strong><p>{t("ไปที่หน้าใส่คีย์ของสคริปต์")}</p></div></li><li><span>03</span><div><strong>{t("วางคีย์ แล้วกดยืนยัน")}</strong><p>{t("ใช้คีย์ก่อนหมดอายุที่ระบุไว้")}</p></div><ChevronRight size={18}/></li></ol></section>; }
