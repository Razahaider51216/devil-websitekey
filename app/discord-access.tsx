"use client";
import { useCallback, useEffect, useState } from "react";
import { ArrowRight, Loader2, ShieldCheck } from "lucide-react";
import { Header, Footer, api, AdminVisibility } from "./components";
import { TurnstileStep } from "./turnstile-step";
import { useLanguage } from "./language";
type Session = { required: boolean; configured?: boolean; siteKey?: string; challenge?: string; user?: { id: string; name: string; isAdmin: boolean } | null };
export function DiscordAccess({ children, adminOnly = false }: { children: React.ReactNode; adminOnly?: boolean }) {
  const { t } = useLanguage();
  const [session, setSession] = useState<Session | null>(null), [error, setError] = useState(""), [token, setToken] = useState(""), [busy, setBusy] = useState(false);
  const refresh = useCallback(async () => {
    try { setSession(await api("auth/session")); setError(new URLSearchParams(window.location.search).has("login") ? t("เข้าสู่ระบบไม่สำเร็จ กรุณาลองอีกครั้ง") : ""); }
    catch { setError(t("ติดต่อระบบไม่ได้ กรุณาลองอีกครั้ง")); }
  }, [t]);
  useEffect(() => { refresh(); }, [refresh]);
  async function login() {
    if (!token || busy) return; setBusy(true); setError("");
    try { const result = await api("auth/discord/start", { method: "POST", body: JSON.stringify({ token }) }); window.location.assign(result.url); }
    catch (e) { setToken(""); setError(t((e as Error).message)); setBusy(false); }
  }
  async function logout() {
    setBusy(true);
    try { await api("auth/logout", { method: "POST", body: "{}" }); window.location.assign("/"); }
    catch { setError(t("ติดต่อระบบไม่ได้ กรุณาลองอีกครั้ง")); setBusy(false); }
  }
  if (session && adminOnly && (!session.required || (session.user && !session.user.isAdmin))) return <><Header/><main className="login-shell"><section className="login-panel"><ShieldCheck size={32}/><h1>ACCESS<br/><span>RESTRICTED.</span></h1><p>{t("เฉพาะแอดมินที่ได้รับอนุญาตเท่านั้น")}</p><a href="/" className="quiet-button">{t("กลับหน้ารับคีย์")}</a></section></main><Footer/></>;
  if (session && (!session.required || session.user)) return <AdminVisibility.Provider value={!!session.user?.isAdmin}>{session.user && <div className="discord-session"><span><ShieldCheck size={14}/>{session.user.name}</span><button type="button" onClick={logout} disabled={busy}>{t("ออกจากระบบ")}</button>{error && <span role="alert">{error}</span>}</div>}{children}</AdminVisibility.Provider>;
  return <><Header/><main className="login-shell"><section className="login-panel"><div className="eyebrow"><ShieldCheck size={14}/> DEVIL KEY / SECURE SIGN IN</div><h1>SIGN IN.<br/><span>GET ACCESS.</span></h1><p>{t("เข้าสู่ระบบด้วย Discord ก่อนรับคีย์ DEVIL HUB")}</p><p className="muted">{t("ใช้เฉพาะข้อมูลโปรไฟล์ ไม่ขอสิทธิ์จัดการเซิร์ฟเวอร์")}</p>
    {error && <div className="notice error" role="alert">{error}</div>}
    {!session ? <button className="quiet-button" type="button" onClick={refresh}>{error ? t("ลองอีกครั้ง") : <Loader2 className="spin" size={20}/>}</button> : !session.configured ? <div className="notice error">{t("แอดมินยังไม่ได้ตั้งค่า Discord Login")}</div> : <><TurnstileStep action="devil-key-login" siteKey={session.siteKey || ""} challenge={session.challenge || ""} passed={!!token} unlocked onVerify={async value => { setToken(value); }}/><button className="discord-login-button" type="button" onClick={login} disabled={!token || busy}>{busy ? <Loader2 className="spin" size={18}/> : <><span>{t("เข้าสู่ระบบด้วย Discord")}</span><ArrowRight size={18}/></>}</button></>}
  </section></main><Footer/></>;
}
