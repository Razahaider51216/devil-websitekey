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
const env=globalThis.__securityEnv={KEY_SECRET:'integration-only-'.repeat(3),DISCORD_LOGIN_REQUIRED:'1',REQUIRE_TURNSTILE:'1',DISCORD_CLIENT_ID:'123456789012345678',DISCORD_CLIENT_SECRET:'test-only',TURNSTILE_SITE_KEY:'test-site',TURNSTILE_SECRET_KEY:'test-secret',DISCORD_ADMIN_USER_IDS:'123456789012345678',PUBLIC_KEY_HOURS:'24',DISCORD_URL:'https://discord.gg/test',YOUTUBE_CHANNEL_URL:'https://youtube.com/@test',YOUTUBE_VIDEO_URL:'https://youtube.com/watch?v=test'};
const {handle}=await import('../lib/server.ts');
const {seal}=await import('../lib/security.ts');
const {hash,keyFor}=await import('../lib/domain.ts');
const origin='https://example.test';
let clock=1800000000000;
const realNow=Date.now, realFetch=globalThis.fetch;
Date.now=()=>clock;
let client, challenge, captchaAction='devil-key-login', identity='123456789012345678', exchanges=0;
let googleNonce='',googleSubject='123456789012345678',googleExchanges=0,googleBadNonce=false;
const googlePair=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
const googleJwk={...await crypto.subtle.exportKey('jwk',googlePair.publicKey),kid:'integration-google',alg:'RS256',use:'sig'};
async function googleToken(){
  const now=Math.floor(clock/1000),encode=x=>Buffer.from(JSON.stringify(x)).toString('base64url');
  const message=encode({alg:'RS256',kid:googleJwk.kid})+'.'+encode({iss:'https://accounts.google.com',aud:env.GOOGLE_CLIENT_ID,sub:googleSubject,nonce:googleBadNonce?'wrong':googleNonce,iat:now,exp:now+3600,name:'Google tester',picture:'https://lh3.googleusercontent.com/a/test'});
  return message+'.'+Buffer.from(await crypto.subtle.sign('RSASSA-PKCS1-v1_5',googlePair.privateKey,new TextEncoder().encode(message))).toString('base64url');
}
globalThis.fetch=async(url,options)=>{
  if(String(url).includes('siteverify'))return Response.json({success:options.body.get('response')==='valid-token',hostname:'example.test',action:captchaAction,cdata:challenge});
  if(String(url).endsWith('/oauth2/token')){exchanges++;return Response.json({access_token:'private',token_type:'Bearer'});}
  if(String(url).endsWith('/users/@me'))return Response.json({id:identity,username:'tester'});
  if(String(url)==='https://oauth2.googleapis.com/token'){googleExchanges++;assert.ok(options.body.get('code_verifier'));return Response.json({id_token:await googleToken()});}
  if(String(url)==='https://www.googleapis.com/oauth2/v3/certs')return Response.json({keys:[googleJwk]});
  throw new Error('Unexpected external HTTP blocked');
};
async function reset(){
  client?.close();client=createClient({url:':memory:'});globalThis.__securityDb=drizzle(client,{schema});
  for(const name of readdirSync(new URL('../drizzle/',import.meta.url)).filter(x=>x.endsWith('.sql')).sort())await client.executeMultiple(readFileSync(new URL('../drizzle/'+name,import.meta.url),'utf8'));
  clock+=600000;env.DISCORD_LOGIN_REQUIRED='1';env.TURNSTILE_SECRET_KEY='test-secret';identity='123456789012345678';exchanges=0;
  env.GOOGLE_CLIENT_ID='';env.GOOGLE_CLIENT_SECRET='';googleNonce='';googleSubject=identity;googleExchanges=0;googleBadNonce=false;
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
  async startGoogle(){
    const session=await this.call('auth/session');challenge=session.data.challenge;captchaAction='devil-key-login';
    assert.equal(session.data.providers.google,true);const start=await this.call('auth/google/start','POST',{token:'valid-token'});assert.equal(start.status,200);
    const url=new URL(start.data.url);assert.equal(url.origin,'https://accounts.google.com');googleNonce=url.searchParams.get('nonce');return url.searchParams.get('state');
  }
  async loginGoogle(){const state=await this.startGoogle();const result=await this.call('auth/google/callback?state='+state+'&code=code');assert.equal(result.headers.get('location'),'/');return state;}
}
test('server security integration',async t=>{
  await t.test('independent Finder test isolates premium keys, device-bound sessions, reports, filters and expiry from the main runtime',async()=>{
    await reset();const adminUser=new Browser();await adminUser.login();
    const premium=(await adminUser.call('admin/keys','POST',{kind:'days',amount:1,label:'finder fixture'})).data;
    const a=new Browser(),b=new Browser(),jobA='12345678-1234-1234-1234-123456789abc',jobB='12345678-1234-1234-1234-123456789abd';
    const input={key:premium.key,hwid:'finder-device-one',placeId:107778070777162,jobId:jobA};
    assert.equal((await a.call('finder-test/session','POST',{...input,placeId:1})).status,400);
    const session=await a.call('finder-test/session','POST',input);assert.equal(session.status,200);
    assert.equal((await b.call('finder-test/session','POST',{...input,hwid:'finder-device-two'})).status,403);
    const other=await b.call('finder-test/session','POST',{...input,jobId:jobB});assert.equal(other.status,200);
    const eggs=[{uid:'field:one',name:'Fixture Dragon',rarity:'Divine',income:5e9,scale:10,mutation:'Golden'},{uid:'field:two',name:'Fixture Cat',rarity:'Rare',income:1000,scale:1,mutation:''}];
    assert.equal((await a.call('finder-test/report','POST',{token:session.data.token,eggs})).status,200);
    let feed=await b.call('finder-test/feed','POST',{token:other.data.token,minimum:1e9,rarity:'Divine',query:'golden'});
    assert.equal(feed.status,200);assert.equal(feed.data.entries.length,1);assert.equal(feed.data.entries[0].jobId,jobA);assert.equal(feed.data.entries[0].placeId,107778070777162);
    assert.equal((await b.call('finder-test/feed','POST',{token:other.data.token,rarity:'Rare'})).data.entries.length,1);
    assert.equal((await a.call('finder-test/report','POST',{token:session.data.token,eggs:[...eggs,eggs[0]]})).status,400);
    assert.equal((await a.call('finder-test/report','POST',{token:session.data.token,eggs:[{...eggs[0],income:-1}]})).status,400);
    assert.equal((await b.call('finder-test/feed','POST',{token:'wrong'})).status,401);
    assert.equal((await b.call('finder-test/feed','POST',{token:other.data.token},{origin:'https://evil.test'})).status,403);
    clock+=120001;assert.equal((await b.call('finder-test/feed','POST',{token:other.data.token})).data.entries.length,0);
    await client.execute({sql:'UPDATE access_keys SET source=? WHERE id=?',args:['steps',premium.id]});
    assert.equal((await b.call('finder-test/feed','POST',{token:other.data.token})).status,403);
    assert.equal((await b.call('finder-test/session','POST',{...input,jobId:jobB})).status,403);
    await client.execute({sql:'UPDATE access_keys SET source=? WHERE id=?',args:['admin',premium.id]});
    await client.execute({sql:'UPDATE key_devices SET hwid_hash=? WHERE key_id=?',args:['different-device',premium.id]});
    assert.equal((await b.call('finder-test/feed','POST',{token:other.data.token})).status,403);
    await client.execute({sql:'UPDATE key_devices SET hwid_hash=? WHERE key_id=?',args:[await hash('DEVIL-HWID:v1:finder-device-one'),premium.id]});
    clock+=900001;assert.equal((await b.call('finder-test/feed','POST',{token:other.data.token})).status,401);
    assert.equal((await client.execute("SELECT count(*) AS n FROM site_settings WHERE id='runtime:active'")).rows[0].n,0);
  });
  await t.test('Google identity can claim and restore keys but never inherits Discord admin IDs',async()=>{
    await reset();env.GOOGLE_CLIENT_ID='integration.apps.googleusercontent.com';env.GOOGLE_CLIENT_SECRET='integration-only';
    const g=new Browser();await g.loginGoogle();const session=(await g.call('auth/session')).data;
    assert.equal(session.user.provider,'google');assert.equal(session.user.id,'google:123456789012345678');assert.equal(session.user.isAdmin,false);
    assert.equal((await g.call('admin/keys')).status,403,'Google numeric sub must not collide with Discord admin allowlist');
    await readySix(g);const issued=await g.call('flow/claim','POST',{});assert.equal(issued.status,200);
    assert.equal((await client.execute('select owner_id from access_keys')).rows[0].owner_id,session.user.id);
    const same=new Browser();await same.loginGoogle();assert.equal((await same.call('flow')).data.key.key,issued.data.key);
    const discord=new Browser();await discord.login();assert.equal((await discord.call('flow/select','POST',{plan:'6h'})).data.key,null,'providers are never silently linked');
    assert.equal((await discord.call('admin/keys')).status,200,'existing Discord admin access is preserved');
    const replay=new Browser();replay.jar=new Map(g.jar);await g.call('auth/logout','POST',{});
    assert.equal((await replay.call('flow')).status,401,'Google logout revokes the server-side session');
  });
  await t.test('Google requires CAPTCHA, matching one-use state, PKCE and a valid signed nonce',async()=>{
    await reset();env.GOOGLE_CLIENT_ID='integration.apps.googleusercontent.com';env.GOOGLE_CLIENT_SECRET='integration-only';
    const b=new Browser();const s=await b.call('auth/session');challenge=s.data.challenge;
    assert.equal((await b.call('auth/google/start','POST',{token:'valid-token'},{origin:'https://evil.test'})).status,403);
    assert.equal((await b.call('auth/google/start','POST',{token:'invalid'})).status,400);
    const state=await b.startGoogle();const mismatch=await b.call('auth/google/callback?state=wrong&code=code');assert.match(mismatch.headers.get('location'),/LOGIN_STATE_MISMATCH/);assert.equal(googleExchanges,0);
    const state2=await b.startGoogle();googleBadNonce=true;
    const bad=await b.call('auth/google/callback?state='+state2+'&code=code');assert.match(bad.headers.get('location'),/GOOGLE_TOKEN_INVALID/);
    assert.equal((await b.call('auth/session')).data.user,null);
    googleBadNonce=false;const state3=await b.startGoogle();const oldCookies=new Browser();oldCookies.jar=new Map(b.jar);
    assert.equal((await b.call('auth/google/callback?state='+state3+'&code=code')).headers.get('location'),'/');
    const replay=await b.call('auth/google/callback?state='+state3+'&code=code');assert.match(replay.headers.get('location'),/LOGIN_COOKIE_MISSING/);
    assert.match((await oldCookies.call('auth/google/callback?state='+state3+'&code=code')).headers.get('location'),/LOGIN_STATE_EXPIRED/);
    assert.equal(googleExchanges,2,'invalid nonce and successful login exchange only once each');
    const mix=new Browser(),mixedState=await mix.startGoogle();assert.match((await mix.call('auth/discord/callback?state='+mixedState+'&code=code')).headers.get('location'),/LOGIN_COOKIE_MISSING/);
    assert.equal(googleExchanges,2,'Discord callback cannot consume Google authorization state');
    const disabled=new Browser();env.GOOGLE_CLIENT_SECRET='';assert.equal((await disabled.call('auth/google/start','POST',{token:'valid-token'})).status,503);
    assert.equal((await disabled.call('auth/session')).data.providers.discord,true);
  });
  await t.test('supported games seed, Discord-admin CRUD, safe links, visibility and concurrent editing',async()=>{
    await reset();const guest=new Browser(),owner=new Browser(),member=new Browser();
    const seeded=await guest.call('games');assert.equal(seeded.status,200);assert.equal(seeded.data.games.length,12);
    assert.ok(seeded.data.games.every(game=>game.gameUrl.startsWith('https://www.roblox.com/games/')&&game.imageUrl.startsWith('/games/')));
    assert.equal((await guest.call('admin/games')).status,401);
    await member.login('223456789012345678');assert.equal((await member.call('admin/games')).status,403);
    await owner.login();let catalog=(await owner.call('admin/games')).data;
    const draft={name:'Added game',imageUrl:'https://tr.rbxcdn.com/image.png',gameUrl:'https://www.roblox.com/games/12345/Test?tracking=1',enabled:true,sortOrder:20};
    assert.equal((await member.call('admin/games','POST',{revision:catalog.revision,game:draft})).status,403);
    assert.equal((await owner.call('admin/games','POST',{revision:catalog.revision,game:draft},{origin:'https://evil.test'})).status,403);
    for(const patch of [{gameUrl:'javascript:alert(1)'},{gameUrl:'https://www.roblox.com.evil.test/games/12345'},{imageUrl:'data:text/html,bad'},{imageUrl:'https://user:pass@example.com/x.png'},{sortOrder:-1},{name:''}]) {
      assert.equal((await owner.call('admin/games','POST',{revision:catalog.revision,game:{...draft,...patch}})).status,400);
    }
    const added=await owner.call('admin/games','POST',{revision:catalog.revision,game:draft});assert.equal(added.status,200);
    const game=added.data.games.find(g=>g.name==='Added game');assert.equal(game.gameUrl,'https://www.roblox.com/games/12345');
    assert.equal((await guest.call('games')).data.games.length,13);
    assert.equal((await owner.call('admin/games/'+game.id,'PATCH',{revision:catalog.revision,game:{...draft,name:'Stale edit'}})).status,409);
    const contenders=await Promise.all(['First edit','Second edit'].map(name=>owner.call('admin/games/'+game.id,'PATCH',{revision:added.data.revision,game:{...draft,name,enabled:false}})));
    assert.deepEqual(contenders.map(r=>r.status).sort(),[200,409]);
    assert.equal((await guest.call('games')).data.games.length,12,'hidden game must not be public');
    catalog=(await owner.call('admin/games')).data;assert.equal(catalog.games.length,13,'hidden game remains editable');
    assert.equal((await owner.call('admin/games/'+game.id,'DELETE',{revision:catalog.revision})).status,200);
    assert.equal((await owner.call('admin/games')).data.games.length,12);
    assert.equal((await client.execute('select count(*) n from access_keys')).rows[0].n,0,'game edits must not change key data');
  });
  async function readySix(b) {
    await b.call('flow/select','POST',{plan:'6h'});
    await b.call('flow/open','POST',{step:1});await b.call('flow/return','POST',{step:1});clock+=30000;
    const s=await b.call('flow');challenge=s.data.turnstile.challenge;captchaAction='devil-key-claim';
    assert.equal((await b.call('flow/verify','POST',{token:'valid-token'})).status,200);
  }
  await t.test('account lock survives plan changes, new browsers and simultaneous claims until expiry',async()=>{
    await reset();const a=new Browser(),b=new Browser();await a.login();await b.login();
    await readySix(a);await readySix(b);
    const claimed=await Promise.all([a.call('flow/claim','POST',{}),b.call('flow/claim','POST',{})]);
    assert.ok(claimed.every(r=>[200,409].includes(r.status)),JSON.stringify(claimed));
    assert.equal((await client.execute('select count(*) n from access_keys')).rows[0].n,1);
    const key=claimed.find(r=>r.status===200).data;
    for(const browser of [a,b])for(const plan of ['12h','24h','6h']) {
      const selected=await browser.call('flow/select','POST',{plan});
      assert.equal(selected.data.key.key,key.key);assert.equal(selected.data.key.expiresAt,key.expiresAt);
      assert.equal(selected.data.plan,'6h');assert.equal(selected.data.canClaim,false);
      assert.equal((await browser.call('flow/open','POST',{step:1})).status,409);
    }
    const fresh=new Browser();await fresh.login();
    assert.equal((await fresh.call('flow')).data.key.key,key.key);
    assert.equal((await fresh.call('flow/claim','POST',{})).data.expiresAt,key.expiresAt);
    const other=new Browser();await other.login('223456789012345678');
    assert.equal((await other.call('flow/select','POST',{plan:'6h'})).data.key,null);
    clock=key.expiresAt;
    const renewed=await fresh.call('flow/select','POST',{plan:'12h'});
    assert.equal(renewed.data.plan,'12h');assert.equal(renewed.data.key,null);
    assert.ok(renewed.data.steps.every(s=>s.status==='ready'));
  });
  await t.test('signed legacy flow is adopted without losing its existing key',async()=>{
    await reset();const b=new Browser();await b.login();await readySix(b);
    const issued=await b.call('flow/claim','POST',{});
    await client.execute('update flows set owner_id=null');await client.execute('update access_keys set owner_id=null');
    assert.equal((await b.call('flow/select','POST',{plan:'24h'})).data.key.key,issued.data.key);
    const fresh=new Browser();await fresh.login();assert.equal((await fresh.call('flow')).data.key.key,issued.data.key);
  });
  await t.test('Discord required; captcha, state, replay and admin ID enforced without a password',async()=>{
    await reset();const b=new Browser();
    assert.equal((await b.call('flow')).status,401);
    assert.equal((await b.call('admin/keys','GET',undefined,{})).status,401);
    const s=await b.call('auth/session');challenge=s.data.challenge;
    assert.equal((await b.call('auth/discord/start','POST',{token:'bad'})).status,400);
    captchaAction='devil-key-claim';assert.equal((await b.call('auth/discord/start','POST',{token:'valid-token'})).status,400);
    captchaAction='devil-key-login';const start=await b.call('auth/discord/start','POST',{token:'valid-token'});
    const state=new URL(start.data.url).searchParams.get('state');
    const oauthCookie=b.jar.get('__Host-devil_oauth');
    assert.equal((await b.call('auth/discord/callback?state=wrong&code=code')).headers.get('location'),'/?login=failed&reason=LOGIN_STATE_MISMATCH');
    b.jar.set('__Host-devil_oauth',oauthCookie);
    const callbacks=await Promise.all([b.call('auth/discord/callback?state='+state+'&code=code'),b.call('auth/discord/callback?state='+state+'&code=code')]);
    assert.equal(callbacks.filter(r=>r.headers.get('location')==='/').length,1);assert.equal(exchanges,1);
    assert.equal((await b.call('auth/session')).data.user.isAdmin,true);
    const exchangeCount=exchanges;
    b.jar.set('__Host-devil_oauth',oauthCookie);
    assert.match((await b.call('auth/discord/callback?state='+state+'&code=code')).headers.get('location'),/^\/\?login=failed&reason=LOGIN_[A-Z_]+$/);
    assert.equal(exchanges,exchangeCount);
    assert.equal((await b.call('admin/keys')).status,200);
    assert.equal((await b.call('admin/keys','GET',undefined,{})).status,200);
    const other=new Browser();await other.login('223456789012345678');assert.equal((await other.call('auth/session')).data.user.isAdmin,false);
    assert.equal((await other.call('admin/keys','GET',undefined,{})).status,403);
    const replay=await b.call('auth/discord/callback?state='+state+'&code=code');assert.match(replay.headers.get('location'),/^\/\?login=failed&reason=LOGIN_[A-Z_]+$/);
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
    await reset();const b=new Browser();await b.login();const auth={};
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
    await reset();const b=new Browser();await b.login();const auth={};
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
    assert.equal((await b.call('flow/select','POST',{plan:'12h'})).data.plan,'6h','active key prevents switching to another duration');
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
    const b=new Browser(),auth={};
    assert.equal((await b.call('admin/scripts','GET',undefined,auth)).status,401);
    await b.login();assert.equal((await b.call('admin/scripts')).status,200);
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
    const direct=await get(download,'GET');assert.equal(direct.status,403);assert.match(await direct.text(),/Huh, what are you doing here\?/);
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

  await t.test('OAuth callback reports safe categories and preserves state/cookie checks on the new domain',async()=>{
    await reset();const b=new Browser();
    assert.equal((await b.call('auth/discord/callback?state=missing&code=secret-code')).headers.get('location'),'/?login=failed&reason=LOGIN_COOKIE_MISSING');
    const current=await b.call('auth/session');challenge=current.data.challenge;captchaAction='devil-key-login';
    const start=await b.call('auth/discord/start','POST',{token:'valid-token'});const state=new URL(start.data.url).searchParams.get('state');
    const saved=globalThis.fetch, logs=[], warn=console.warn;
    console.warn=(...args)=>logs.push(args.join(' '));
    try {
      globalThis.fetch=async()=>Response.json({error:'invalid_client',error_description:'private details must not be exposed'},{status:401});
      const callback=await b.call('auth/discord/callback?state='+state+'&code=secret-code');
      assert.equal(callback.headers.get('location'),'/?login=failed&reason=DISCORD_CLIENT_INVALID');
      assert.equal(logs.at(-1),'DEVIL KEY Discord login failed DISCORD_CLIENT_INVALID');
      assert(!logs.join(' ').includes('secret-code'));assert(!logs.join(' ').includes(state));assert(!logs.join(' ').includes('private details'));
      assert.equal((await b.call('auth/session')).data.user,null);
    } finally {globalThis.fetch=saved;console.warn=warn;}
  });

  await t.test('Discord session alone grants admin access; headers cannot bypass IDs, logout or expiry',async()=>{
    await reset();const adminUser=new Browser(),anonymous=new Browser();const forged={authorization:'Bearer old-admin-password'};
    for(const route of ['admin/keys','admin/settings','admin/scripts']) assert.equal((await anonymous.call(route,'GET',undefined,forged)).status,401);
    await adminUser.login();
    for(const route of ['admin/keys','admin/settings','admin/scripts']) assert.equal((await adminUser.call(route)).status,200);
    const ids=env.DISCORD_ADMIN_USER_IDS;
    try {
      env.DISCORD_ADMIN_USER_IDS='';
      assert.equal((await adminUser.call('admin/keys')).status,403);
      assert.equal((await adminUser.call('admin/keys','POST',{kind:'permanent',amount:0,label:'denied'})).status,403);
      assert.equal((await adminUser.call('admin/scripts','GET',undefined,forged)).status,403);
    } finally {env.DISCORD_ADMIN_USER_IDS=ids;}
    assert.equal((await adminUser.call('admin/keys','POST',{kind:'permanent',amount:0,label:'allowed'}, {origin:'https://evil.test'})).status,403);
    await adminUser.call('auth/logout','POST',{});assert.equal((await adminUser.call('admin/keys','GET',undefined,forged)).status,401);
    await adminUser.login();clock+=28_800_001;assert.equal((await adminUser.call('admin/keys')).status,401);
  });

  await t.test('private main delivery checks key/device, immutable manifest, all file hashes and replay expiry',async()=>{
    await reset();const b=new Browser();await b.login();const data=new Map();
    const object=(key)=>data.has(key)?{size:data.get(key).length,arrayBuffer:async()=>data.get(key).slice().buffer}:null;
    env.SCRIPT_FILES={get:async key=>object(key),head:async key=>object(key)};
    const {createHash}=await import('node:crypto');const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
    const {blobKey,manifestKey}=await import('../lib/runtime-storage.ts');
    const source=new TextEncoder().encode('return "unchanged runtime"');let checksum=0;for(const byte of source)checksum=(checksum*33+byte)>>>0;
    const ref='a'.repeat(40),file=ref+'/loader',release='runtime-fixture-1';
    const premiumFile=ref+'/premium/break-x2.lua';
    const manifest={release,root:file,maps:12,files:{[file]:{sha256:sha(source),bytes:source.length,checksum},[premiumFile]:{sha256:sha(source),bytes:source.length,checksum,entitlement:'break-x2'}}};
    const manifestBytes=new TextEncoder().encode(JSON.stringify(manifest));const pointer={release,sha256:sha(manifestBytes)};
    data.set(manifestKey(release),manifestBytes);
    const created=(await b.call('admin/keys','POST',{kind:'permanent',amount:0,label:'runtime'})).data;
    const login={key:created.key,hwid:'executor:runtime-device',bootstrap:'private-runtime-domain-20261028-2'};
    assert.equal((await b.call('runtime/session','POST',{...login,key:'invalid'})).status,403);
    assert.equal((await b.call('runtime/session','POST',{key:created.key,hwid:login.hwid})).status,426);
    assert.equal((await b.call('runtime/session','POST',login)).status,503);
    assert.equal((await b.call('admin/runtime','POST',pointer)).status,409,'incomplete dependency upload cannot be published');
    data.set(blobKey(sha(source)),source);
    assert.equal((await b.call('admin/runtime','POST',pointer)).status,200);
    const stranger=new Browser();assert.equal((await stranger.call('admin/runtime')).status,401);
    const result=await b.call('runtime/session','POST',login);assert.equal(result.status,200);assert.equal(result.data.bytes,source.length);
    assert.equal(result.data.features.breakAutoX2,true);assert.equal(result.data.premiumEntry,result.data.prefix+premiumFile);
    assert.equal(result.data.features.premium,true);
    const ordinaryId=crypto.randomUUID(),ordinaryKey=await keyFor(ordinaryId,env.KEY_SECRET);
    await globalThis.__securityDb.insert(schema.keys).values({id:ordinaryId,keyHash:await hash(ordinaryKey),label:'mission',source:'steps',createdAt:clock,expiresAt:clock+3600000,durationKind:'hours',durationAmount:1});
    const ordinary=await b.call('runtime/session','POST',{...login,key:ordinaryKey,features:{breakAutoX2:true},source:'admin'});
    assert.equal(ordinary.data.features.breakAutoX2,false);assert.equal(ordinary.data.premiumEntry,null);
    assert.equal(ordinary.data.features.premium,false);
    assert.equal((await b.call('runtime/session','POST',{...login,hwid:'executor:wrong-device'})).status,403);
    async function fetchFile(url) {
      const request=new Request(url,{headers:{'cf-connecting-ip':b.ip}});const path=new URL(url).pathname.slice(5).split('/');
      try{return await handle(request,path);}catch(e){return Response.json({error:e.message},{status:e.status||e.code||500});}
    }
    const response=await fetchFile(result.data.entry);assert.equal(response.status,200);assert.equal(await response.text(),'return "unchanged runtime"');
    assert.equal((await fetchFile(result.data.premiumEntry)).status,200,'active admin-created key can download premium module');
    assert.equal((await fetchFile(ordinary.data.prefix+premiumFile)).status,403,'forged client flags cannot download premium code');
    assert.equal((await fetchFile(ordinary.data.prefix+'main/premium/break-x2.lua')).status,403,'legacy aliases cannot bypass premium entitlement');
    assert.equal((await fetchFile(ordinary.data.entry)).status,200,'standard keys retain regular maps');
    const browserRequest=new Request(result.data.entry,{headers:{accept:'text/html','sec-fetch-mode':'navigate'}});
    const browserResponse=await handle(browserRequest,new URL(result.data.entry).pathname.slice(5).split('/'));
    assert.equal(browserResponse.status,403);assert.match(await browserResponse.text(),/Huh, what are you doing here\?/);
    assert.equal(browserResponse.headers.get('content-type'),'text/html; charset=utf-8');
    assert.equal(response.headers.get('cache-control'),'private, no-store');
    assert.equal(await (await fetchFile(result.data.prefix+'main/loader')).text(),'return \"unchanged runtime\"');
    assert.equal(await (await fetchFile(result.data.prefix+'refs/heads/main/loader')).text(),'return \"unchanged runtime\"');
    assert.equal((await fetchFile(result.data.prefix+ref+'/not-published.lua')).status,404);
    assert.equal((await fetchFile(result.data.entry.replace('/files/','/files/x'))).status,403);
    data.set(blobKey(sha(source)),new TextEncoder().encode('tampered'));assert.equal((await fetchFile(result.data.entry)).status,503);data.set(blobKey(sha(source)),source);
    data.set(manifestKey(release),new TextEncoder().encode('{}'));assert.equal((await fetchFile(result.data.entry)).status,503);data.set(manifestKey(release),manifestBytes);
    const now=clock;clock+=86_400_001;assert.equal((await fetchFile(result.data.entry)).status,403);clock=now;
    await b.call('admin/keys/'+created.id,'DELETE',{});assert.equal((await fetchFile(result.data.entry)).status,403);

    const bootstrapBytes=new TextEncoder().encode('return "bootstrap only"'),bootstrapHash=sha(bootstrapBytes);
    data.set('runtime/bootstrap/'+bootstrapHash+'.lua',bootstrapBytes);
    await client.execute({sql:'INSERT INTO site_settings (id,value,updated_at) VALUES (?,?,?)',args:['runtime:bootstrap',JSON.stringify({sha256:bootstrapHash,bytes:bootstrapBytes.length}),clock]});
    const {GET}=await import('../app/loader/route.ts');
    const landing=await GET(new Request(origin+'/loader',{headers:{accept:'text/html'}}));
    assert.equal(landing.status,403);assert.match(await landing.text(),/Huh, what are you doing here\?/);
    const publicEntry=await GET();assert.equal(publicEntry.status,200);assert.equal(await publicEntry.text(),'return "bootstrap only"');
    data.set('runtime/bootstrap/'+bootstrapHash+'.lua',new TextEncoder().encode('wrong'));
    assert.equal((await GET()).status,503,'public loader never serves corrupted content');
    delete env.SCRIPT_FILES;
  });
}).finally(()=>{Date.now=realNow;globalThis.fetch=realFetch;client?.close();});
