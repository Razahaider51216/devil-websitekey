// Real handlers + real SQLite, with only runtime bindings and external OAuth/CAPTCHA mocked.
// Never loads .env and never contacts production services.
import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
registerHooks({resolve(specifier,context,next){
  if(specifier==='cloudflare:workers')return {url:'data:text/javascript,export const env=globalThis.__securityEnv;',shortCircuit:true};
  if(specifier==='../db' && context.parentURL?.includes('/lib/'))return {url:'data:text/javascript,export const getDb=()=>globalThis.__securityDb;',shortCircuit:true};
  if(specifier.startsWith('.') && context.parentURL?.startsWith('file:')) {
    const url=new URL(specifier,context.parentURL);
    if(!existsSync(fileURLToPath(url)) && existsSync(fileURLToPath(url)+'.ts'))return next(pathToFileURL(fileURLToPath(url)+'.ts').href,context);
  }
  return next(specifier,context);
}});
const schema=await import('../db/schema.ts');
const env=globalThis.__securityEnv={KEY_SECRET:'integration-only-'.repeat(3),ADMIN_ACCESS_KEY:'admin-password-only-'.repeat(2),DISCORD_LOGIN_REQUIRED:'1',REQUIRE_TURNSTILE:'1',DISCORD_CLIENT_ID:'123456789012345678',DISCORD_CLIENT_SECRET:'test-only',TURNSTILE_SITE_KEY:'test-site',TURNSTILE_SECRET_KEY:'test-secret',DISCORD_ADMIN_USER_IDS:'123456789012345678',PUBLIC_KEY_HOURS:'24',DISCORD_URL:'https://discord.gg/test',YOUTUBE_CHANNEL_URL:'https://youtube.com/@test',YOUTUBE_VIDEO_URL:'https://youtube.com/watch?v=test'};
const {handle}=await import('../lib/server.ts');
const {seal}=await import('../lib/security.ts');
const {hash,keyFor}=await import('../lib/domain.ts');
const origin='https://example.test';
let clock=1800000000000;
const realNow=Date.now, realFetch=globalThis.fetch;
Date.now=()=>clock;
let client, challenge, captchaAction='devil-key-login', identity='123456789012345678', exchanges=0;
globalThis.fetch=async(url,options)=>{
  if(String(url).includes('siteverify'))return Response.json({success:options.body.get('response')==='valid-token',hostname:'example.test',action:captchaAction,cdata:challenge});
  if(String(url).endsWith('/oauth2/token')){exchanges++;return Response.json({access_token:'private',token_type:'Bearer'});}
  if(String(url).endsWith('/users/@me'))return Response.json({id:identity,username:'tester'});
  throw new Error('Unexpected external HTTP blocked');
};
async function reset(){
  client?.close();client=createClient({url:':memory:'});globalThis.__securityDb=drizzle(client,{schema});
  for(const name of readdirSync(new URL('../drizzle/',import.meta.url)).filter(x=>x.endsWith('.sql')).sort())await client.executeMultiple(readFileSync(new URL('../drizzle/'+name,import.meta.url),'utf8'));
  clock+=600000;env.DISCORD_LOGIN_REQUIRED='1';env.TURNSTILE_SECRET_KEY='test-secret';identity='123456789012345678';exchanges=0;
}
class Browser {
  jar=new Map();ip=crypto.randomUUID();
  async call(route,method='GET',body,extra={}){
    const req=new Request(origin+'/api/'+route,{method,headers:{origin,'cf-connecting-ip':this.ip,'content-type':'application/json',cookie:[...this.jar].map(([k,v])=>k+'='+v).join('; '),...extra},...(method!=='GET'?{body:JSON.stringify(body??{})}:{})});
    let res;try{res=await handle(req,route.split('?')[0].split('/'));}catch(e){res=Response.json({error:e.message},{status:e.code||e.status||500});}
    for(const c of res.headers.getSetCookie()){const part=c.split(';')[0],idx=part.indexOf('=');this.jar.set(part.slice(0,idx),part.slice(idx+1));}
    return {status:res.status,headers:res.headers,data:res.status===302?null:await res.json()};
  }
  async login(id='123456789012345678'){
    identity=id;const session=await this.call('auth/session');challenge=session.data.challenge;captchaAction='devil-key-login';
    const start=await this.call('auth/discord/start','POST',{token:'valid-token'});assert.equal(start.status,200);
    const state=new URL(start.data.url).searchParams.get('state');
    const result=await this.call('auth/discord/callback?state='+state+'&code=code');
    assert.equal(result.headers.get('location'),'/');return state;
  }
}
test('server security integration',async t=>{
  await t.test('Discord required; captcha, state, replay, admin ID and password enforced',async()=>{
    await reset();const b=new Browser();
    assert.equal((await b.call('flow')).status,401);
    assert.equal((await b.call('admin/keys','GET',undefined,{authorization:'Bearer '+env.ADMIN_ACCESS_KEY})).status,401);
    const s=await b.call('auth/session');challenge=s.data.challenge;
    assert.equal((await b.call('auth/discord/start','POST',{token:'bad'})).status,400);
    captchaAction='devil-key-claim';assert.equal((await b.call('auth/discord/start','POST',{token:'valid-token'})).status,400);
    captchaAction='devil-key-login';const start=await b.call('auth/discord/start','POST',{token:'valid-token'});
    const state=new URL(start.data.url).searchParams.get('state');
    const oauthCookie=b.jar.get('__Host-devil_oauth');
    assert.equal((await b.call('auth/discord/callback?state=wrong&code=code')).headers.get('location'),'/?login=failed');
    b.jar.set('__Host-devil_oauth',oauthCookie);
    const callbacks=await Promise.all([b.call('auth/discord/callback?state='+state+'&code=code'),b.call('auth/discord/callback?state='+state+'&code=code')]);
    assert.equal(callbacks.filter(r=>r.headers.get('location')==='/').length,1);assert.equal(exchanges,1);
    assert.equal((await b.call('auth/session')).data.user.isAdmin,true);
    const exchangeCount=exchanges;
    b.jar.set('__Host-devil_oauth',oauthCookie);
    assert.equal((await b.call('auth/discord/callback?state='+state+'&code=code')).headers.get('location'),'/?login=failed');
    assert.equal(exchanges,exchangeCount);
    assert.equal((await b.call('admin/keys')).status,401);
    assert.equal((await b.call('admin/keys','GET',undefined,{authorization:'Bearer '+env.ADMIN_ACCESS_KEY})).status,200);
    const other=new Browser();await other.login('223456789012345678');assert.equal((await other.call('auth/session')).data.user.isAdmin,false);
    assert.equal((await other.call('admin/keys','GET',undefined,{authorization:'Bearer '+env.ADMIN_ACCESS_KEY})).status,403);
    const replay=await b.call('auth/discord/callback?state='+state+'&code=code');assert.equal(replay.headers.get('location'),'/?login=failed');
    const stolen=new Browser();stolen.jar=new Map(b.jar);await b.call('auth/logout','POST',{});assert.equal((await stolen.call('flow')).status,401);
  });
  await t.test('sequential server timers, account ownership, captcha freshness and atomic issuance',async()=>{
    await reset();const b=new Browser();await b.login();await b.call('flow');
    assert.equal((await b.call('flow/claim','POST',{canClaim:true,expiresAt:null})).status,409);
    assert.equal((await b.call('flow/open','POST',{step:4})).status,409);
    for(let step=1;step<=4;step++){
      assert.equal((await b.call('flow/open','POST',{step,now:clock-999999})).status,200);
      assert.equal((await b.call('flow/return','POST',{step,returnedAt:clock-999999})).data.steps[step-1].status,'waiting');
      clock+=29999;assert.equal((await b.call('flow/claim','POST',{})).status,409);clock++;
    }
    const s=await b.call('flow');challenge=s.data.turnstile.challenge;captchaAction='devil-key-claim';
    assert.equal((await b.call('flow/claim','POST',{})).status,409);
    assert.equal((await b.call('flow/verify','POST',{token:'bad'})).status,400);
    assert.equal((await b.call('flow/verify','POST',{token:'valid-token'})).status,200);
    const other=new Browser();await other.login('223456789012345678');other.jar.set('devil_flow',b.jar.get('devil_flow'));other.jar.set('__Host-devil_flow_owner',b.jar.get('__Host-devil_flow_owner'));
    assert.equal((await other.call('flow/claim','POST',{})).status,401);
    const issued=await Promise.all(Array.from({length:5},()=>b.call('flow/claim','POST',{kind:'permanent',amount:9999})));
    assert.ok(issued.every(r=>r.status===200),JSON.stringify(issued));assert.equal(new Set(issued.map(r=>r.data.key)).size,1);
    assert.equal(issued[0].data.expiresAt-issued[0].data.createdAt,86400000);
    assert.equal((await client.execute('select count(*) n from access_keys')).rows[0].n,1);
  });
  await t.test('script validation stays public and HWID binding/expiry remain enforced',async()=>{
    await reset();const id=crypto.randomUUID(),key=await keyFor(id,env.KEY_SECRET);
    await globalThis.__securityDb.insert(schema.keys).values({id,keyHash:await hash(key),label:'legacy',source:'admin',createdAt:clock,expiresAt:clock+1000,revokedAt:null,durationKind:'hours',durationAmount:24});
    const a=new Browser(),b=new Browser();const result=await Promise.all([a.call('validate','POST',{key,hwid:'device-aaaaaaaa'}),b.call('validate','POST',{key,hwid:'device-bbbbbbbb'})]);
    assert.equal(result.filter(r=>r.data.valid).length,1);assert.equal(result.filter(r=>r.data.status==='hwid_mismatch').length,1);
    clock+=1000;assert.equal((await a.call('validate','POST',{key,hwid:'device-aaaaaaaa'})).data.status,'expired');
    env.TURNSTILE_SECRET_KEY='';assert.equal((await a.call('flow')).status,503);
  });
  await t.test('slow return body cannot backdate cooldown and stale CAPTCHA cannot issue a key',async()=>{
    await reset();const b=new Browser();await b.login();await b.call('flow');
    let release;const body=new ReadableStream({start(c){release=()=>{c.enqueue(new TextEncoder().encode('{"step":1}'));c.close();};}});
    const delayed=new Request(origin+'/api/flow/return',{method:'POST',headers:{origin,'cf-connecting-ip':b.ip,'content-type':'application/json',cookie:[...b.jar].map(([k,v])=>k+'='+v).join('; ')},body,duplex:'half'});
    const pending=handle(delayed,['flow','return']);clock+=60000;
    await b.call('flow/open','POST',{step:1});clock+=60000;release();
    assert.equal((await (await pending).json()).steps[0].status,'waiting');
    const row=(await client.execute('select returned_at from steps where number=1')).rows[0];assert.equal(row.returned_at,clock);
    clock+=30000;
    for(let step=2;step<=4;step++){await b.call('flow/open','POST',{step});await b.call('flow/return','POST',{step});clock+=30000;}
    const s=await b.call('flow');challenge=s.data.turnstile.challenge;captchaAction='devil-key-claim';await b.call('flow/verify','POST',{token:'valid-token'});
    clock+=300001;assert.equal((await b.call('flow/claim','POST',{})).status,409);
    assert.equal((await client.execute('select count(*) n from access_keys')).rows[0].n,0);
  });
}).finally(()=>{Date.now=realNow;globalThis.fetch=realFetch;client?.close();});
