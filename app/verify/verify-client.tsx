"use client";
import { useCallback,useEffect,useRef,useState } from "react";
import { ArrowUpRight,Check,Loader2,ShieldCheck } from "lucide-react";
import { TurnstileStep } from "../turnstile-step";
type Auth={user?:{id:string;name:string;provider:string}|null;siteKey?:string;challenge?:string};
type Session={status:string;guildName:string;roleName:string;expiresAt:number;returnUrl:string;user?:{id:string;name:string};siteKey?:string;challenge?:string};
async function api<T>(path:string,body?:unknown):Promise<T>{
  const response=await fetch('/api/'+path,{method:body===undefined?'GET':'POST',credentials:'same-origin',cache:'no-store',headers:body===undefined?undefined:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
  const data=await response.json() as T & {error?:string};if(!response.ok)throw new Error(data.error||'Verification is temporarily unavailable.');return data;
}
export function DiscordVerification(){
  const [auth,setAuth]=useState<Auth|null>(null),[session,setSession]=useState<Session|null>(null),[ticket,setTicket]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true);
  const loginToken=useRef(''),verifyToken=useRef('');const [loginReady,setLoginReady]=useState(false),[verifyReady,setVerifyReady]=useState(false);
  const activeTicket=useRef('');
  const load=useCallback(async(value:string)=>{const data=await api<Session>('discord-verify/session',{ticket:value});if(activeTicket.current===value)setSession(data);return data;},[]);
  useEffect(()=>{
    let stopped=false;
    async function start(){
      setLoading(true);setError('');setSession(null);setAuth(null);setLoginReady(false);setVerifyReady(false);loginToken.current='';verifyToken.current='';
      try{
        const fromLink=new URLSearchParams(window.location.hash.slice(1)).get('ticket');
        if(fromLink){if(!/^[a-f0-9]{64}$/.test(fromLink))throw new Error('Invalid verification link. Open your private link from Discord.');sessionStorage.setItem('devil-discord-verify-ticket',fromLink);window.history.replaceState(null,'','/verify');}
        const value=fromLink||sessionStorage.getItem('devil-discord-verify-ticket')||'';
        if(!value)throw new Error('Open your private verification link using the Verify button in Discord.');
        if(stopped)return;activeTicket.current=value;setTicket(value);
        const account=await api<Auth>('auth/session');if(stopped)return;setAuth(account);
        if(account.user?.provider==='discord')await load(value);
      }catch(e){if(!stopped)setError((e as Error).message);}finally{if(!stopped)setLoading(false);}
    }
    const changed=()=>{if(window.location.hash)void start();};
    void start();window.addEventListener('hashchange',changed);return()=>{stopped=true;window.removeEventListener('hashchange',changed);};
  },[load]);
  useEffect(()=>{
    if(session?.status!=='approved'||!ticket)return;
    let stopped=false,inflight=false;
    const poll=async()=>{if(stopped||inflight||document.hidden)return;inflight=true;try{await load(ticket);}catch(e){if(!stopped)setError((e as Error).message);}finally{inflight=false;}};
    const timer=setInterval(poll,2500);document.addEventListener('visibilitychange',poll);
    return()=>{stopped=true;clearInterval(timer);document.removeEventListener('visibilitychange',poll);};
  },[session?.status,ticket,load]);
  async function signIn(){
    setBusy(true);setError('');try{const data=await api<{url:string}>('auth/discord/start',{token:loginToken.current,returnTo:'/verify'});window.location.assign(data.url);}
    catch(e){setError((e as Error).message);loginToken.current='';setLoginReady(false);}finally{setBusy(false);}
  }
  async function switchAccount(){setBusy(true);try{await api('auth/logout',{});window.location.reload();}catch(e){setError((e as Error).message);setBusy(false);}}
  async function confirm(){
    setBusy(true);setError('');try{const data=await api<Session>('discord-verify/confirm',{ticket,token:verifyToken.current});setSession(current=>({...current!,...data}));}
    catch(e){setError((e as Error).message);verifyToken.current='';setVerifyReady(false);}finally{setBusy(false);}
  }
  const done=session?.status==='done',pending=session?.status==='approved',failed=session?.status==='failed'||session?.status==='expired';
  return <main className="discord-verify-page" lang="en"><section className="discord-verify-card">
    <img className="discord-verify-logo" src="/devilhubv3.png" width={96} height={64} alt="DEVIL HUB"/>
    <span className="eyebrow"><ShieldCheck size={14}/> DISCORD // IDENTITY CHECK</span>
    <h1>{done?'VERIFIED.':pending?'ALMOST THERE.':'VERIFY YOUR IDENTITY.'}</h1>
    <p>{done?'Your identity has been verified successfully. Your role has been assigned.':pending?'Your security check passed. The bot is assigning your role.':'Confirm your Discord account and complete the human verification to receive your server role.'}</p>
    {loading&&<div className="discord-verify-status"><Loader2 className="spin" size={20}/> Loading your private verification…</div>}
    {error&&<div className="notice error" role="alert">{error}</div>}
    {!loading&&auth&&auth.user?.provider!=='discord'&&<>
      {auth.user?<><p>Use the Discord account that pressed Verify. Google accounts cannot receive Discord roles.</p><button className="quiet-button" disabled={busy} onClick={switchAccount}>Switch to Discord</button></>:<>
        <TurnstileStep siteKey={auth.siteKey||''} challenge={auth.challenge||''} passed={loginReady} unlocked onVerify={async token=>{loginToken.current=token;setLoginReady(true);}} action="devil-key-login" english description="Complete this security check before signing in with Discord."/>
        <button className="primary-button" disabled={!loginReady||busy} onClick={signIn}>{busy?<Loader2 className="spin" size={17}/>:<ShieldCheck size={17}/>} Sign in with Discord</button>
      </>}
    </>}
    {auth?.user?.provider==='discord'&&<div className="discord-verify-account"><span>DISCORD ACCOUNT</span><strong>{auth.user.name}</strong><button className="quiet-button" disabled={busy} onClick={switchAccount}>Switch account</button></div>}
    {session&&<div className="discord-verify-details"><div><span>SERVER</span><strong>{session.guildName}</strong></div><div><span>ROLE</span><strong>{session.roleName}</strong></div></div>}
    {session?.status==='pending'&&<>
      <TurnstileStep siteKey={session.siteKey||''} challenge={session.challenge||''} passed={verifyReady} unlocked onVerify={async token=>{verifyToken.current=token;setVerifyReady(true);}} action="devil-discord-verify" english description="Complete the human verification, then press Confirm Verification below."/>
      <button className="primary-button" disabled={!verifyReady||busy} onClick={confirm}>{busy?<Loader2 className="spin" size={17}/>:<ShieldCheck size={17}/>} Confirm Verification</button>
    </>}
    {pending&&<div className="discord-verify-status" role="status"><Loader2 className="spin" size={20}/> Waiting for the Discord bot…</div>}
    {done&&<div className="discord-verify-status verified" role="status"><Check size={21}/> Verification successful</div>}
    {failed&&<div className="notice error" role="alert">{session.status==='expired'?'Your link expired. Return to Discord and press Verify again.':'The bot could not assign your role. Please contact an administrator or try again.'}</div>}
    {session&&(done||pending||failed)&&<a className="quiet-button discord-verify-return" href={session.returnUrl}>Return to Discord <ArrowUpRight size={16}/></a>}
    <small className="discord-verify-note">PRIVATE SESSION · DEVIL HUB SECURITY</small>
  </section></main>;
}
