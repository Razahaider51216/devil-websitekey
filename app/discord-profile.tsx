"use client";
import { useState } from "react";
import { ShieldCheck, LogOut } from "lucide-react";
import { useLanguage } from "./language";
export type Profile = { id: string; name: string; isAdmin: boolean; avatarUrl?: string; decorationUrl?: string | null };
export function DiscordProfile({ user, logout, busy, error }: { user: Profile; logout: () => void; busy: boolean; error: string }) {
  const { t } = useLanguage(); const [failed, setFailed] = useState(false);
  return <div className="discord-profile"><div className="profile-identity"><div className="profile-avatar"><span className="avatar-orbit"/>{user.avatarUrl && !failed ? <img src={user.avatarUrl} alt="" width={56} height={56} referrerPolicy="no-referrer" onError={() => setFailed(true)}/> : <span className="avatar-fallback">{user.name.slice(0, 1)}</span>}{user.decorationUrl && <img className="avatar-decoration" src={user.decorationUrl} alt="" aria-hidden="true" referrerPolicy="no-referrer"/>}<i className="profile-online"/></div><div className="profile-name"><small>DISCORD / VERIFIED IDENTITY</small><strong>{user.name}<ShieldCheck size={15}/></strong><span>{user.id} <b>{user.isAdmin ? "ADMIN" : "MEMBER"}</b></span></div></div><div className="profile-actions"><span className="version">v1.0.0</span><button type="button" onClick={logout} disabled={busy}><LogOut size={14}/>{t("ออกจากระบบ")}</button></div>{error && <span className="profile-error" role="alert">{error}</span>}</div>;
}
