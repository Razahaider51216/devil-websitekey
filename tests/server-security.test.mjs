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
    await reset();const b=new Browser();await b.login();await b.call('flow/select','POST',{plan:'24h'});
    assert.equal((await b.call('flow/claim','POST',{canClaim:true,expiresAt:null})).status,409);
    assert.equal((await b.call('flow/open','POST',{step:4})).status,400);
    for(let step=1;step<=3;step++){
      assert.equal((await b.call('flow/open','POST',{step,now:clock-999999})).status,200);
      assert.equal((await b.call('flow/return','POST',{step,returnedAt:clock-999999})).data.steps[step-1].status,'waiting');
      clock+=89999;assert.equal((await b.call('flow/claim','POST',{})).status,409);clock++;
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
    await reset();const b=new Browser();await b.login();await b.call('flow/select','POST',{plan:'24h'});
    let release;const body=new ReadableStream({start(c){release=()=>{c.enqueue(new TextEncoder().encode('{"step":1}'));c.close();};}});
    const delayed=new Request(origin+'/api/flow/return',{method:'POST',headers:{origin,'cf-connecting-ip':b.ip,'content-type':'application/json',cookie:[...b.jar].map(([k,v])=>k+'='+v).join('; ')},body,duplex:'half'});
    const pending=handle(delayed,['flow','return']);clock+=60000;
    await b.call('flow/open','POST',{step:1});clock+=60000;release();
    assert.equal((await (await pending).json()).steps[0].status,'waiting');
    const row=(await client.execute('select returned_at from steps where number=1')).rows[0];assert.equal(row.returned_at,clock);
    clock+=90000;
    for(let step=2;step<=3;step++){await b.call('flow/open','POST',{step});await b.call('flow/return','POST',{step});clock+=90000;}
    const s=await b.call('flow');challenge=s.data.turnstile.challenge;captchaAction='devil-key-claim';await b.call('flow/verify','POST',{token:'valid-token'});
    clock+=900001;assert.equal((await b.call('flow/claim','POST',{})).status,409);
    assert.equal((await client.execute('select count(*) n from access_keys')).rows[0].n,0);
  });
  await t.test('all three plans enforce exact hours, counts, timers and mandatory final CAPTCHA',async()=>{
    for(const [plan,hours,links,wait] of [['6h',6,1,30000],['12h',12,2,49000],['24h',24,3,90000]]){
      await reset();const b=new Browser();await b.login();
      assert.equal((await b.call('flow')).data.selected,false);
      assert.equal((await b.call('flow/select','POST',{plan:'999h'})).status,400);
      const selected=await b.call('flow/select','POST',{plan,hours:9999,waitSeconds:0});
      assert.equal(selected.data.lifetimeHours,hours);assert.equal(selected.data.steps.length,links);assert.equal(selected.data.waitSeconds,wait/1000);
      assert.equal((await b.call('flow/claim','POST',{plan:'24h',canClaim:true})).status,409);
      for(let step=1;step<=links;step++){
        await b.call('flow/open','POST',{step});const returned=await b.call('flow/return','POST',{step,returnedAt:0});
        assert.equal(returned.data.steps[step-1].deadline-clock,wait);
        clock+=wait-1;assert.equal((await b.call('flow/verify','POST',{token:'valid-token'})).status,409);clock++;
      }
      const state=await b.call('flow');challenge=state.data.turnstile.challenge;captchaAction='devil-key-claim';
      assert.equal((await b.call('flow/claim','POST',{})).status,409);
      const verified=await b.call('flow/verify','POST',{token:'valid-token'});assert.equal(verified.data.canClaim,true);
      const created=await b.call('flow/claim','POST',{plan:'24h',kind:'permanent',amount:999});
      assert.equal(created.status,200);assert.equal(created.data.expiresAt-clock,hours*3600000);
      assert.equal((await b.call('flow/select','POST',{plan})).data.key.key,created.data.key);
    }
  });
  await t.test('mode switching cannot carry progress; links are configured independently by admin',async()=>{
    await reset();const b=new Browser();await b.login();const auth={authorization:'Bearer '+env.ADMIN_ACCESS_KEY};
    const links={discordUrl:'https://discord.gg/mode12',channelUrl:'https://youtube.com/@mode12',videoUrl:'',commentUrl:'',likeUrl:''};
    assert.equal((await b.call('admin/settings','POST',{plan:'12h',links},auth)).status,200);
    const selected=await b.call('flow/select','POST',{plan:'12h'});assert.equal(selected.data.steps[0].url,links.discordUrl);
    await b.call('flow/open','POST',{step:1});await b.call('flow/return','POST',{step:1});clock+=49000;
    const changed=await b.call('flow/select','POST',{plan:'24h'});assert.equal(changed.data.steps[0].status,'ready');assert.notEqual(changed.data.steps[0].url,links.discordUrl);
    assert.equal((await b.call('flow/claim','POST',{})).status,409);
    const config=(await b.call('admin/settings','GET',undefined,auth)).data;assert.equal(config.modes.length,3);
    const bad={...links,discordUrl:'javascript:alert(1)'};assert.equal((await b.call('admin/settings','POST',{plan:'24h',links:bad},auth)).status,400);
  });
  await t.test('6H requires one admin-selected Discord or YouTube mission before final CAPTCHA',async()=>{
    await reset();const b=new Browser();await b.login();const auth={authorization:'Bearer '+env.ADMIN_ACCESS_KEY};
    const links={discordUrl:'https://discord.gg/six',channelUrl:'https://youtube.com/@six',videoUrl:'',commentUrl:'',likeUrl:'',sixHourService:'youtube'};
    assert.equal((await b.call('admin/settings','POST',{plan:'6h',links},auth)).status,200);
    const selected=await b.call('flow/select','POST',{plan:'6h'});
    assert.equal(selected.data.steps.length,1);assert.equal(selected.data.steps[0].service,'YOUTUBE');assert.equal(selected.data.steps[0].url,links.channelUrl);
    assert.equal((await b.call('flow/verify','POST',{token:'valid-token'})).status,409);
    await b.call('flow/open','POST',{step:1});await b.call('flow/return','POST',{step:1});clock+=29999;
    assert.equal((await b.call('flow/verify','POST',{token:'valid-token'})).status,409);clock++;
    const current=await b.call('flow');challenge=current.data.turnstile.challenge;captchaAction='devil-key-claim';
    assert.equal((await b.call('flow/verify','POST',{token:'valid-token'})).data.canClaim,true);
    assert.equal((await b.call('flow/claim','POST',{})).data.expiresAt-clock,21600000);
    assert.equal((await b.call('admin/settings','POST',{plan:'6h',links:{...links,sixHourService:'discord'}},auth)).status,200);
    assert.equal((await b.call('flow')).data.steps[0].url,links.discordUrl);
    assert.equal((await b.call('admin/settings','POST',{plan:'6h',links:{...links,sixHourService:'invalid'}},auth)).status,400);
    assert.equal((await b.call('flow/select','POST',{plan:'12h'})).data.steps[0].url,env.DISCORD_URL);
  });

  await t.test('private script vault enforces admin, drafts, key/HWID, immutable revisions and disable',async()=>{
    await reset();
    const objects=new Map();let reads=0;
    const wrapped=(key,value)=>({key,size:value.bytes.length,customMetadata:value.meta,
      arrayBuffer:async()=>value.bytes.slice().buffer});
    env.SCRIPT_FILES={
      async put(key,bytes,options){assert.equal(options.onlyIf.etagDoesNotMatch,'*');if(objects.has(key))return null;
        const value={bytes:new Uint8Array(bytes),meta:options.customMetadata};objects.set(key,value);return wrapped(key,value);},
      async get(key){reads++;return objects.has(key)?wrapped(key,objects.get(key)):null;},
      async head(key){return objects.has(key)?wrapped(key,objects.get(key)):null;},
      async list({prefix}){return {objects:[...objects].filter(([key])=>key.startsWith(prefix)).map(([key,value])=>wrapped(key,value)),truncated:false};},
    };
    const b=new Browser(),auth={authorization:'Bearer '+env.ADMIN_ACCESS_KEY};
    assert.equal((await b.call('admin/scripts','GET',undefined,auth)).status,401);
    await b.login();assert.equal((await b.call('admin/scripts')).status,401);
    assert.equal((await b.call('admin/scripts','GET',undefined,auth)).data.configured,true);
    const other=new Browser();await other.login('223456789012345678');assert.equal((await other.call('admin/scripts','GET',undefined,auth)).status,403);
    async function upload(body='return "original"',extra={}) {
      const req=new Request(origin+'/api/admin/scripts/anime-dice',{method:'POST',headers:{origin,'cf-connecting-ip':b.ip,
        cookie:[...b.jar].map(([k,v])=>k+'='+v).join('; '),...auth,'content-type':'text/plain',...extra},body});
      try{return await handle(req,['admin','scripts','anime-dice']);}catch(e){return Response.json({error:e.message},{status:e.status||e.code||500});}
    }
    assert.equal((await upload('return 1',{origin:'https://evil.test'})).status,403);
    assert.equal((await upload('')).status,400);
    assert.equal((await upload('binary\0file'.replace('\\0','\0'))).status,400);
    assert.equal((await upload('return 1',{'content-length':String(9*1024*1024)})).status,413);
    const first=await upload();assert.equal(first.status,201);const revision=await first.json();
    assert.equal(objects.size,1);assert.equal(revision.published,false);
    const created=(await b.call('admin/keys','POST',{kind:'days',amount:1,label:'vault test'},auth)).data;
    const download={script:'anime-dice',key:created.key,hwid:'device-12345678'};
    async function get(input=download,method='POST') {
      const req=new Request(origin+'/api/scripts/download',{method,headers:{'content-type':'application/json','cf-connecting-ip':b.ip},...(method==='POST'?{body:JSON.stringify(input)}:{})});
      try{return await handle(req,['scripts','download']);}catch(e){return Response.json({error:e.message},{status:e.status||e.code||500});}
    }
    assert.equal((await get()).status,404);assert.equal(reads,0);
    assert.equal((await get({...download,key:'bad'})).status,403);assert.equal(reads,0);
    assert.equal((await get(download,'GET')).status,404);
    assert.equal((await b.call('admin/scripts/anime-dice','PUT',{revision:'../bad'},auth)).status,400);
    assert.equal((await b.call('admin/scripts/anime-dice','PUT',{revision:revision.revision},auth)).status,200);
    const response=await get();assert.equal(response.status,200);assert.equal(await response.text(),'return "original"');
    assert.equal(response.headers.get('cache-control'),'private, no-store');assert.equal(response.headers.get('x-devil-sha256'),revision.sha256);
    assert.equal((await get({...download,hwid:'different-device'})).status,403);
    clock++;const second=await (await upload('return "new"')).json();assert.notEqual(second.revision,revision.revision);assert.equal(objects.size,2);
    assert.equal(await (await get()).text(),'return "original"','uploads must not activate themselves');
    const history=await b.call('admin/scripts/anime-dice','GET',undefined,auth);assert.equal(history.data.revisions.length,2);
    const key=[...objects.keys()][0];const intact=objects.get(key).bytes;objects.get(key).bytes=new TextEncoder().encode('tampered');
    assert.equal((await get()).status,503);objects.get(key).bytes=intact;
    await b.call('admin/scripts/anime-dice','PUT',{enabled:false},auth);assert.equal((await get()).status,404);
    await b.call('admin/scripts/anime-dice','PUT',{revision:second.revision},auth);assert.equal(await (await get()).text(),'return "new"');
    await b.call('admin/scripts/anime-dice','PUT',{revision:revision.revision},auth);assert.equal(await (await get()).text(),'return "original"');
    await b.call('admin/keys/'+created.id,'DELETE',{},auth);assert.equal((await get()).status,403);
    delete env.SCRIPT_FILES;assert.equal((await b.call('admin/scripts','GET',undefined,auth)).data.configured,false);
    assert.equal((await b.call('admin/scripts/anime-dice','GET',undefined,auth)).status,503);
  });
}).finally(()=>{Date.now=realNow;globalThis.fetch=realFetch;client?.close();});
