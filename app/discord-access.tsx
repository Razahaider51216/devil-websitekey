"use client";
import { useCallback, useEffect, useState } from "react";
import { ArrowRight, Loader2, ShieldCheck } from "lucide-react";
import { Header, Footer, api, AdminVisibility } from "./components";
import { TurnstileStep } from "./turnstile-step";
import { useLanguage } from "./language";
import { DiscordProfile, type Profile } from "./discord-profile";
import { loginFailureCode } from "../lib/login-failure";
type Session = { required: boolean; configured?: boolean; providers?: { google: boolean; discord: boolean }; siteKey?: string; challenge?: string; user?: Profile | null };
export function DiscordAccess({ children, adminOnly = false }: { children: React.ReactNode; adminOnly?: boolean }) {
  const { t } = useLanguage();
  const [session, setSession] = useState<Session | null>(null), [error, setError] = useState(""), [token, setToken] = useState(""), [busy, setBusy] = useState(false);
  const [provider, setProvider] = useState<"google" | "discord" | null>(null);
  const refresh = useCallback(async () => {
    try {
      const current = await api("auth/session"); setSession(current);
      const query = new URLSearchParams(window.location.search);
      setError(!current.user && query.get("login") === "failed" ? t("เข้าสู่ระบบไม่สำเร็จ กรุณาลองอีกครั้ง") + (query.has("reason") ? ` [${loginFailureCode(query.get("reason"))}]` : "") : "");
    }
    catch { setError(t("ติดต่อระบบไม่ได้ กรุณาลองอีกครั้ง")); }
  }, [t]);
  useEffect(() => { refresh(); }, [refresh]);
  async function login(choice: "google" | "discord") {
    if (!token || busy) return; setBusy(true); setProvider(choice);setError("");
    try { const result = await api(`auth/${choice}/start`, { method: "POST", body: JSON.stringify({ token }) }); window.location.assign(result.url); }
    catch (e) { setToken(""); setError(t((e as Error).message)); setBusy(false); }
  }
  async function logout() {
    setBusy(true);
    try { await api("auth/logout", { method: "POST", body: "{}" }); window.location.assign("/"); }
    catch { setError(t("ติดต่อระบบไม่ได้ กรุณาลองอีกครั้ง")); setBusy(false); }
  }
  if (session && adminOnly && (!session.required || (session.user && !session.user.isAdmin))) return <><Header/><main className="login-shell"><section className="login-panel"><ShieldCheck size={32}/><h1>ACCESS<br/><span>RESTRICTED.</span></h1><p>{t("เฉพาะแอดมินที่ได้รับอนุญาตเท่านั้น")}</p>{session.user?.provider === "google" && <><p>{t("หลังบ้านใช้บัญชี Discord ของแอดมิน")}</p><button className="quiet-button" disabled={busy} onClick={logout}>{t("ออกจากระบบเพื่อเปลี่ยนบัญชี")}</button></>}<a href="/" className="quiet-button">{t("กลับหน้ารับคีย์")}</a></section></main><Footer/></>;
  if (session && (!session.required || session.user)) return <AdminVisibility.Provider value={!!session.user?.isAdmin}>{session.user && <DiscordProfile user={session.user} logout={logout} busy={busy} error={error}/>}{children}</AdminVisibility.Provider>;
  const providers = session?.providers || { discord: !!session?.configured, google: false };
  return <><Header/><main className="login-shell"><section className="login-panel"><div className="eyebrow"><ShieldCheck size={14}/> DEVIL KEY / SECURE SIGN IN</div><h1>SIGN IN.<br/><span>GET ACCESS.</span></h1><p>{adminOnly ? t("หลังบ้านใช้บัญชี Discord ของแอดมิน") : t("เข้าสู่ระบบด้วย Google หรือ Discord ก่อนรับคีย์ DEVIL HUB")}</p><p className="muted">{t("ใช้เฉพาะข้อมูลโปรไฟล์เพื่อยืนยันตัวตน")}</p>
    {error && <div className="notice error" role="alert">{error}</div>}
    {!session ? <button className="quiet-button" type="button" onClick={refresh}>{error ? t("ลองอีกครั้ง") : <Loader2 className="spin" size={20}/>}</button> : !session.configured ? <div className="notice error">{t("แอดมินยังไม่ได้ตั้งค่าระบบเข้าสู่ระบบ")}</div> : <><TurnstileStep action="devil-key-login" siteKey={session.siteKey || ""} challenge={session.challenge || ""} passed={!!token} unlocked onVerify={async value => { setToken(value); }}/><div className="login-provider-options">{!adminOnly && <><button className="google-login-button" type="button" onClick={() => login("google")} disabled={!token || busy || !providers.google}>{busy && provider === "google" ? <Loader2 className="spin" size={18}/> : <GoogleIcon/>}<span>{t("เข้าสู่ระบบด้วย Google")}</span></button>{!providers.google && <small className="provider-unavailable">{t("Google ยังไม่พร้อมใช้งาน")}</small>}<div className="provider-divider"><span/>{t("หรือ")}<span/></div></>}<button className="discord-login-button" type="button" onClick={() => login("discord")} disabled={!token || busy || !providers.discord}>{busy && provider === "discord" ? <Loader2 className="spin" size={18}/> : <><span>{t("เข้าสู่ระบบด้วย Discord")}</span><ArrowRight size={18}/></>}</button></div></>}
  </section></main><Footer/></>;
}
function GoogleIcon() {
  return <svg viewBox="0 0 48 48" width="20" height="20" aria-hidden="true"><path fill="#4285F4" d="M43.6 24.5c0-1.5-.1-2.8-.4-4.2H24v8h11a9.4 9.4 0 0 1-4.1 6.2v5.2h6.7c3.9-3.6 6-8.8 6-15.2Z"/><path fill="#34A853" d="M24 44c5.5 0 10.1-1.8 13.5-5l-6.7-5.2c-1.8 1.2-4.1 1.9-6.8 1.9-5.3 0-9.8-3.6-11.4-8.4H5.7v5.4A20.4 20.4 0 0 0 24 44Z"/><path fill="#FBBC05" d="M12.6 27.3a12.2 12.2 0 0 1 0-7.7v-5.4H5.7a20 20 0 0 0 0 18.5l6.9-5.4Z"/><path fill="#EA4335" d="M24 11.3c3 0 5.6 1 7.7 3l5.8-5.8A19.5 19.5 0 0 0 24 3 20.4 20.4 0 0 0 5.7 14.2l6.9 5.4C14.2 14.8 18.7 11.3 24 11.3Z"/></svg>;
}
