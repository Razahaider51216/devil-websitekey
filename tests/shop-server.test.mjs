// Real route handlers and real SQLite transactions. Only CF storage and SlipOK are fixtures.
import test from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {existsSync,readFileSync,readdirSync} from 'node:fs';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createClient} from '@libsql/client';
import {drizzle} from 'drizzle-orm/libsql';
registerHooks({resolve(specifier,context,next){
  if(specifier==='cloudflare:workers')return{url:'data:text/javascript,export const env=globalThis.__shopEnv',shortCircuit:true};
  if(specifier==='../db'&&context.parentURL?.includes('/lib/'))return{url:'data:text/javascript,export const getDb=()=>globalThis.__shopDb',shortCircuit:true};
  if(specifier.startsWith('.')&&context.parentURL?.startsWith('file:')){const p=fileURLToPath(new URL(specifier,context.parentURL));if(!existsSync(p)&&existsSync(p+'.ts'))return next(pathToFileURL(p+'.ts').href,context);}
  return next(specifier,context);
}});
const schema=await import('../db/schema.ts');
const env=globalThis.__shopEnv={KEY_SECRET:'shop-integration-only-'.repeat(3),DISCORD_LOGIN_REQUIRED:'1',DISCORD_CLIENT_ID:'123456789012345678',DISCORD_CLIENT_SECRET:'fixture',TURNSTILE_SITE_KEY:'fixture',TURNSTILE_SECRET_KEY:'fixture',DISCORD_ADMIN_USER_IDS:'123456789012345678',SLIPOK_BRANCH_ID:'123',SLIPOK_API_KEY:'private-slipok-test-key'};
const {handle,HttpError}=await import('../lib/server.ts');
const {seal,RequestError}=await import('../lib/security.ts');
const {hash}=await import('../lib/domain.ts');
let client,clock=Date.parse('2026-11-03T06:30:00Z'),calls=0,proof,objects=new Map(),providerDelay=0,failBatch=false;
const realNow=Date.now,realFetch=fetch;Date.now=()=>clock;
globalThis.fetch=async(url,options)=>{
  assert.equal(String(url),'https://api.slipok.com/api/line/apikey/123','No unintended external request');calls++;
  assert.equal(options.headers['x-authorization'],env.SLIPOK_API_KEY);assert.equal(options.body.get('log'),'true');
  assert.equal(options.body.get('amount'),'99.90');
  if(providerDelay)await new Promise(r=>setTimeout(r,providerDelay));
  return Response.json(proof.code?proof:{success:true,data:proof},{status:proof.code?400:200});
};
const origin='https://shop.test',adminId='123456789012345678',owner='223456789012345678',other='323456789012345678';
const config={enabled:true,promptpayId:'0812345678',receiverName:'ทดสอบ ระบบ',receiverAliases:['TEST SYSTEM'],orderMinutes:20};
const draft={name:'Premium 30 days',description:'Integration fixture',price:'99.90',durationKind:'days',durationAmount:30,enabled:true,sortOrder:0};
class Statement{
  constructor(sql,args=[]){this.sql=sql;this.args=args;}
  bind(...args){return new Statement(this.sql,args);}
  async first(){return(await client.execute({sql:this.sql,args:this.args})).rows[0]||null;}
  async all(){const result=await client.execute({sql:this.sql,args:this.args});return{success:true,results:result.rows,meta:{changes:result.rowsAffected}};}
  async run(){const result=await client.execute({sql:this.sql,args:this.args});return{success:true,meta:{changes:result.rowsAffected}};}
}
async function reset(){
  client?.close();client=createClient({url:':memory:'});
  for(const name of readdirSync(new URL('../drizzle/',import.meta.url)).filter(x=>x.endsWith('.sql')).sort())await client.executeMultiple(readFileSync(new URL('../drizzle/'+name,import.meta.url),'utf8'));
  globalThis.__shopDb=drizzle(client,{schema});
  env.DB={prepare:sql=>new Statement(sql),batch:async statements=>{
    if(failBatch){failBatch=false;throw Error('simulated D1 unavailable');}
    const results=await client.batch(statements.map(s=>({sql:s.sql,args:s.args})),'write');
    return results.map(r=>({success:true,meta:{changes:r.rowsAffected},results:r.rows}));
  }};
  objects=new Map();env.SCRIPT_FILES={put:async(key,value,opts)=>{objects.set(key,{bytes:typeof value==='string'?new TextEncoder().encode(value):new Uint8Array(value),metadata:opts?.httpMetadata});},get:async key=>{
    const value=objects.get(key);if(!value)return null;return{size:value.bytes.length,body:value.bytes,httpMetadata:value.metadata,arrayBuffer:async()=>value.bytes.buffer,text:async()=>new TextDecoder().decode(value.bytes),json:async()=>JSON.parse(new TextDecoder().decode(value.bytes))};
  }};
  clock=Date.parse('2026-11-03T06:30:00Z');calls=0;providerDelay=0;failBatch=false;
  proof={success:true,transRef:'REF123456789',sendingBank:'004',receivingBank:'006',transTimestamp:new Date(clock+1000).toISOString(),amount:99.90,countryCode:'TH',paidLocalCurrency:'764',receiver:{displayName:'นาย ทดสอบ ร**',proxy:{type:'MSISDN',value:'081xxx5678'}}};
  await client.execute({sql:'INSERT INTO site_settings(id,value,updated_at)VALUES(?,?,?)',args:['shop:settings',JSON.stringify(config),clock]});
}
async function session(id=owner,provider='discord'){
  const session=crypto.randomUUID();await client.execute({sql:'INSERT INTO rate_limits(id,hits,expires_at)VALUES(?,0,?)',args:[provider+'-session:'+await hash(session),clock+3600000]});
  return '__Host-devil_auth='+await seal({id,name:'Fixture '+id,session},provider+'-session',env.KEY_SECRET,3600000,clock);
}
async function call(path,{method='GET',data,cookie,origin:site=origin}={}){
  const headers={Origin:site,...(cookie?{Cookie:cookie}:{})};if(data&&!(data instanceof FormData))headers['Content-Type']='application/json';
  const req=new Request(origin+'/api/'+path,{method,headers,...(data?{body:data instanceof FormData?data:JSON.stringify(data)}:{})});
  try{const response=await handle(req,path.split('?')[0].split('/'));const raw=await response.text();return{status:response.status,data:response.headers.get('Content-Type')?.includes('application/json')?JSON.parse(raw):raw,headers:response.headers};}
  catch(e){if(e instanceof HttpError||e instanceof RequestError)return{status:e.status||e.code,data:{error:e.message}};throw e;}
}
async function product(cookie){const value=await call('admin/shop/products',{method:'POST',cookie,data:{product:draft}});assert.equal(value.status,201);return value.data.products[0];}
async function order(cookie,id,clientId=crypto.randomUUID()){
  const response=await call('shop/orders',{method:'POST',cookie,data:{productId:id,clientId}});assert.ok([200,201].includes(response.status),JSON.stringify(response));return response.data;
}
function upload(extra=''){const form=new FormData();form.set('slip',new File([new Uint8Array([255,216,...new TextEncoder().encode(extra),255,217])],'slip.jpg',{type:'image/jpeg'}));return form;}
async function failedPurchase(admin,user,extra=''){
  const p=await product(admin),a=await order(user,p.id);clock+=2000;proof={code:1009};
  assert.equal((await call('shop/orders/'+a.id+'/verify',{method:'POST',cookie:user,data:upload(extra)})).status,503);
  return (await call('admin/shop/orders',{cookie:admin})).data.orders.find(o=>o.id===a.id);
}
const approval=o=>({slipSha256:o.slipSha256,attempts:o.attempts});
const count=async table=>Number((await client.execute('SELECT count(*) n FROM '+table)).rows[0].n);
test('premium shop routes',async t=>{
 try{
  await t.test('CRUD is admin-only, CSRF protected, versioned, validates prices and hides unpublished/deleted products',async()=>{
    await reset();const admin=await session(adminId),user=await session();
    assert.equal((await call('admin/shop')).status,401);assert.equal((await call('admin/shop',{cookie:user})).status,403);
    assert.equal((await call('admin/shop/products',{method:'POST',cookie:admin,origin:'https://evil.test',data:{product:draft}})).status,403);
    for(const change of [{price:'0'},{price:'1.001'},{durationAmount:0}])assert.equal((await call('admin/shop/products',{method:'POST',cookie:admin,data:{product:{...draft,...change}}})).status,400);
    const p=await product(admin);assert.equal((await call('shop/products')).data.products.length,1);
    const changed=await call('admin/shop/products/'+p.id,{method:'PUT',cookie:admin,data:{product:{...draft,enabled:false},revision:p.updatedAt}});assert.equal(changed.status,200);
    assert.equal((await call('shop/products')).data.products.length,0);
    assert.equal((await call('admin/shop/products/'+p.id,{method:'PUT',cookie:admin,data:{product:draft,revision:p.updatedAt}})).status,409);
    const latest=changed.data.products[0];assert.equal((await call('admin/shop/products/'+p.id,{method:'DELETE',cookie:admin,data:{revision:latest.updatedAt}})).status,200);
    assert.equal((await call('admin/shop',{cookie:admin})).data.products.length,0);
    assert.equal(await count('shop_products'),1,'Deletion retains order lineage');
    const settings=(await call('admin/shop',{cookie:admin})).data;assert.ok(!JSON.stringify(settings).includes(env.SLIPOK_API_KEY));
  });
  await t.test('orders require login, isolate owners, snapshot price/duration and idempotently retry creation',async()=>{
    await reset();const admin=await session(adminId),user=await session(),stranger=await session(other),p=await product(admin),nonce=crypto.randomUUID();
    assert.equal((await call('shop/orders',{method:'POST',data:{productId:p.id,clientId:nonce}})).status,401);
    const a=await order(user,p.id,nonce),b=await order(user,p.id,nonce);assert.equal(a.id,b.id);assert.equal(await count('purchase_orders'),1);assert.equal(await count('access_keys'),0);
    assert.equal((await call('shop/orders/'+a.id,{cookie:stranger})).status,404);
    assert.equal((await call('shop/orders/'+a.id+'/verify',{method:'POST',cookie:stranger,data:upload()})).status,404);assert.equal(calls,0);
    await call('admin/shop/products/'+p.id,{method:'PUT',cookie:admin,data:{product:{...draft,price:'199',durationAmount:1},revision:p.updatedAt}});
    const current=(await call('shop/orders/'+a.id,{cookie:user})).data;assert.equal(current.priceSatang,9990);assert.equal(current.durationAmount,30);assert.ok(current.qrPayload.includes('540599.90'));
  });
  await t.test('valid slip atomically issues one purchase premium key, repeat submission returns same key, protected slips stay admin-only',async()=>{
    await reset();const admin=await session(adminId),user=await session(),p=await product(admin),a=await order(user,p.id);clock+=2000;
    const paid=await call('shop/orders/'+a.id+'/verify',{method:'POST',cookie:user,data:upload()});assert.equal(paid.status,200,JSON.stringify(paid));assert.equal(paid.data.status,'paid');assert.match(paid.data.key.key,/^DEVIL-/);
    assert.equal(paid.data.key.expiresAt,clock+30*86400000);assert.equal(await count('access_keys'),1);assert.equal(await count('payment_receipts'),1);assert.equal(calls,1);
    const row=(await client.execute('SELECT * FROM access_keys')).rows[0];assert.equal(row.source,'purchase');assert.equal(row.owner_id,owner);
    const replay=await call('shop/orders/'+a.id+'/verify',{method:'POST',cookie:user,data:upload()});assert.equal(replay.data.key.key,paid.data.key.key);assert.equal(calls,1);
    const list=await call('admin/shop/orders',{cookie:admin});assert.equal(list.data.orders[0].status,'paid');assert.ok(!JSON.stringify(list.data).includes(paid.data.key.key));
    const url=list.data.orders[0].slipUrl.slice(5);assert.equal((await call(url,{cookie:user})).status,403);assert.equal((await call(url,{cookie:admin})).status,200);
    assert.equal((await call('validate',{method:'POST',data:{key:paid.data.key.key,hwid:'purchased-device-one'}})).data.valid,true);
    assert.equal((await call('validate',{method:'POST',data:{key:paid.data.key.key,hwid:'purchased-device-two'}})).data.status,'hwid_mismatch');
    const root='a'.repeat(40)+'/loader',premium='a'.repeat(40)+'/premium.lua',blob='--fixture';const sha=await hash(blob);
    const manifest={release:'shop-fixture',root,maps:14,files:{[root]:{sha256:sha,bytes:blob.length,checksum:1},[premium]:{sha256:sha,bytes:blob.length,checksum:1,entitlement:'break-x2'}}};
    const encoded=JSON.stringify(manifest);await env.SCRIPT_FILES.put('runtime/releases/shop-fixture/manifest.json',encoded);
    await client.execute({sql:'INSERT INTO site_settings(id,value,updated_at)VALUES(?,?,?)',args:['runtime:active',JSON.stringify({release:'shop-fixture',sha256:await hash(encoded)}),clock]});
    const access=await call('runtime/session',{method:'POST',data:{bootstrap:'private-runtime-domain-20261028-2',key:paid.data.key.key,hwid:'purchased-device-one'}});
    assert.equal(access.status,200);assert.equal(access.data.features.premium,true);assert.equal(access.data.features.breakAutoX2,true);
  });
  await t.test('automatic payment and direct admin approval retire only the buyer Free keys in the issuance transaction',async()=>{
    for(const mode of ['automatic','manual']){
      await reset();const admin=await session(adminId),user=await session();
      const free=crypto.randomUUID(),unrelated=crypto.randomUUID();
      for(const [id,ownerId]of [[free,owner],[unrelated,other]])await globalThis.__shopDb.insert(schema.keys).values({id,keyHash:await hash(id),ownerId,label:'Free fixture',source:'steps',createdAt:clock,expiresAt:clock+86400000,durationKind:'hours',durationAmount:24});
      if(mode==='automatic'){
        const p=await product(admin),a=await order(user,p.id);clock+=2000;
        assert.equal((await call('shop/orders/'+a.id+'/verify',{method:'POST',cookie:user,data:upload()})).status,200);
      }else{
        const a=await failedPurchase(admin,user);
        assert.ok((await client.execute({sql:'SELECT expires_at FROM access_keys WHERE id=?',args:[free]})).rows[0].expires_at>clock,'failed slip retired Free before approval');
        assert.equal((await call('admin/shop/orders/'+a.id+'/approve',{method:'POST',cookie:admin,data:approval(a)})).status,200);
      }
      assert.equal((await client.execute({sql:'SELECT expires_at FROM access_keys WHERE id=?',args:[free]})).rows[0].expires_at,clock);
      assert.ok((await client.execute({sql:'SELECT expires_at FROM access_keys WHERE id=?',args:[unrelated]})).rows[0].expires_at>clock);
    }
  });
  await t.test('transient image storage retries before SlipOK and persistent failures never check or issue keys',async()=>{
    await reset();const admin=await session(adminId),user=await session(),p=await product(admin),a=await order(user,p.id);clock+=2000;
    const put=env.SCRIPT_FILES.put;let failures=1;
    env.SCRIPT_FILES.put=async(...args)=>{if(failures-->0)throw Error('temporary storage unavailable');return put(...args);};
    const paid=await call('shop/orders/'+a.id+'/verify',{method:'POST',cookie:user,data:upload()});
    assert.equal(paid.status,200,JSON.stringify(paid));assert.equal(calls,1);assert.equal(await count('access_keys'),1);
    await reset();const admin2=await session(adminId),user2=await session(),p2=await product(admin2),b=await order(user2,p2.id);clock+=2000;
    env.SCRIPT_FILES.put=async()=>{throw Error('private provider detail must not leak');};
    const failed=await call('shop/orders/'+b.id+'/verify',{method:'POST',cookie:user2,data:upload()});
    assert.equal(failed.status,503);assert.equal(failed.data.code,'SLIP_STORAGE_UNAVAILABLE');
    assert.ok(!JSON.stringify(failed).includes('private provider detail'));assert.equal(calls,0);assert.equal(await count('access_keys'),0);
    const row=(await call('shop/orders/'+b.id,{cookie:user2})).data;assert.equal(row.status,'pending');assert.equal(row.retryAt,clock+30000);
  });
  await t.test('wrong amount, recipient, transfer time, duplicate-provider responses and expired invoices never issue keys',async()=>{
    for(const change of [{amount:99.91},{receiver:{displayName:'คนอื่น ระบบ'}},{transTimestamp:new Date(clock-86400000).toISOString()},{code:1012},{code:1013},{code:1014},{code:1002}]){
      await reset();const admin=await session(adminId),user=await session(),p=await product(admin),a=await order(user,p.id);clock+=2000;proof={...proof,...change};
      const result=await call('shop/orders/'+a.id+'/verify',{method:'POST',cookie:user,data:upload()});assert.ok(result.status>=400,JSON.stringify(result));assert.equal(await count('access_keys'),0);assert.equal(await count('payment_receipts'),0);
      assert.equal((await call('shop/orders/'+a.id,{cookie:user})).data.status,'pending');
    }
    await reset();const admin=await session(adminId),user=await session(),p=await product(admin),a=await order(user,p.id);clock=a.expiresAt+24*3600000;
    assert.equal((await call('shop/orders/'+a.id+'/verify',{method:'POST',cookie:await session(),data:upload()})).status,409);assert.equal(calls,0);
  });
  await t.test('bank outage followed by logged duplicate recovers one key, including after the transfer window closes',async()=>{
    await reset();const admin=await session(adminId),user=await session(),p=await product(admin),a=await order(user,p.id);clock+=2000;
    const verified={...proof};proof={code:1009};
    const failed=await call('shop/orders/'+a.id+'/verify',{method:'POST',cookie:user,data:upload()});
    assert.equal(failed.status,503);assert.equal(failed.data.code,'SLIP_BANK_UNAVAILABLE');assert.equal(await count('access_keys'),0);
    assert.equal((await call('shop/orders/'+a.id,{cookie:user})).data.retryAt,clock+900000);
    const {success:omitted,...liveDuplicate}=verified;
    proof={code:1012,data:{...liveDuplicate,receivingBank:'',paidLocalCurrency:null}};clock=a.expiresAt+1000;
    const view=(await call('shop/orders/'+a.id,{cookie:user})).data;
    assert.equal(view.status,'expired');assert.equal(view.canVerify,true);assert.equal(view.qrPayload,null);
    const recovered=await call('shop/orders/'+a.id+'/verify',{method:'POST',cookie:user,data:upload()});
    assert.equal(recovered.status,200,JSON.stringify(recovered));assert.equal(recovered.data.status,'paid');
    assert.equal(await count('access_keys'),1);assert.equal(await count('payment_receipts'),1);
    assert.equal((await call('shop/orders/'+a.id+'/verify',{method:'POST',cookie:user,data:upload()})).data.key.key,recovered.data.key.key);
    assert.equal(calls,2);
  });
  await t.test('logged duplicate data is fully checked and cannot pay two owners or two concurrent orders',async()=>{
    for(const change of [{success:false},{amount:99.91},{receiver:{displayName:'Another Person'}},{transTimestamp:'invalid'},
      {transTimestamp:new Date(Date.parse('2026-11-03T06:30:00Z')+21*60000).toISOString()}]){
      await reset();const admin=await session(adminId),user=await session(),p=await product(admin),a=await order(user,p.id);clock+=2000;
      proof={code:1012,data:{...proof,...change}};
      assert.ok((await call('shop/orders/'+a.id+'/verify',{method:'POST',cookie:user,data:upload()})).status>=400);
      assert.equal(await count('access_keys'),0);assert.equal(await count('payment_receipts'),0);
    }
    await reset();const admin=await session(adminId),user=await session(),stranger=await session(other),p=await product(admin);
    const a=await order(user,p.id),b=await order(stranger,p.id);clock+=2000;providerDelay=20;proof={code:1012,data:proof};
    const results=await Promise.all([
      call('shop/orders/'+a.id+'/verify',{method:'POST',cookie:user,data:upload()}),
      call('shop/orders/'+b.id+'/verify',{method:'POST',cookie:stranger,data:upload('different-image')})]);
    assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
    assert.equal(await count('access_keys'),1);assert.equal(await count('payment_receipts'),1);
  });
  await t.test('late receipt submission never extends the allowed bank transfer time',async()=>{
    await reset();const admin=await session(adminId),user=await session(),p=await product(admin),a=await order(user,p.id);
    clock=a.expiresAt+1000;proof={...proof,transTimestamp:new Date(clock).toISOString()};
    assert.equal((await call('shop/orders/'+a.id+'/verify',{method:'POST',cookie:user,data:upload()})).status,400);
    assert.equal(await count('access_keys'),0);assert.equal(await count('payment_receipts'),0);
  });
  await t.test('concurrent retries call SlipOK once and a bank transaction can never pay two orders',async()=>{
    await reset();const admin=await session(adminId),user=await session(),p=await product(admin),a=await order(user,p.id),b=await order(user,p.id);clock+=2000;providerDelay=30;
    const responses=await Promise.all(Array.from({length:3},()=>call('shop/orders/'+a.id+'/verify',{method:'POST',cookie:user,data:upload()})));
    assert.ok(responses.some(r=>r.status===200));assert.ok(responses.every(r=>r.status===200||r.status===409));assert.equal(calls,1);assert.equal(await count('access_keys'),1);
    const duplicate=await call('shop/orders/'+b.id+'/verify',{method:'POST',cookie:user,data:upload('different-image')});assert.equal(duplicate.status,409);assert.equal(await count('access_keys'),1);
  });
  await t.test('verified proof survives a D1 transaction outage and resumes without rechecking or double-issuing',async()=>{
    await reset();const admin=await session(adminId),user=await session(),p=await product(admin),a=await order(user,p.id);clock+=2000;failBatch=true;
    const failed=await call('shop/orders/'+a.id+'/verify',{method:'POST',cookie:user,data:upload()});assert.equal(failed.status,503);assert.equal(await count('access_keys'),0);assert.equal(calls,1);
    clock+=31000;const retry=await call('shop/orders/'+a.id+'/verify',{method:'POST',cookie:user,data:upload()});assert.equal(retry.status,200,JSON.stringify(retry));assert.equal(calls,1);assert.equal(await count('access_keys'),1);
  });
  await t.test('Google purchases retain Google ownership and cannot be read through a matching numeric Discord account',async()=>{
    await reset();const admin=await session(adminId),google=await session('google:'+owner,'google'),discord=await session(owner),p=await product(admin),a=await order(google,p.id);clock+=2000;
    const paid=await call('shop/orders/'+a.id+'/verify',{method:'POST',cookie:google,data:upload()});assert.equal(paid.status,200);assert.equal((await call('shop/orders/'+a.id,{cookie:discord})).status,404);
    assert.equal((await client.execute('SELECT owner_id FROM access_keys')).rows[0].owner_id,'google:'+owner);
  });
  await t.test('one-click approval is admin-only, issues one premium key and records the admin without bank inputs',async()=>{
    await reset();const admin=await session(adminId),user=await session(),a=await failedPurchase(admin,user),path='admin/shop/orders/'+a.id+'/approve';
    assert.equal((await call(a.slipUrl.slice(5),{cookie:user})).status,403);
    assert.equal((await call(path,{method:'POST',data:approval(a)})).status,401);
    assert.equal((await call(path,{method:'POST',cookie:user,data:approval(a)})).status,403);
    assert.equal((await call(path,{method:'POST',cookie:admin,origin:'https://evil.test',data:approval(a)})).status,403);
    const approved=await call(path,{method:'POST',cookie:admin,data:approval(a)});assert.equal(approved.status,200,JSON.stringify(approved));
    assert.equal(approved.data.review.adminId,adminId);assert.equal(approved.data.status,'paid');assert.equal(approved.data.key,undefined);
    assert.equal((await call('shop/orders/'+a.id,{cookie:user})).data.key.premium,true);
    assert.equal((await call(path,{method:'POST',cookie:admin,data:approval(a)})).status,200);
    assert.equal(await count('access_keys'),1);assert.equal(await count('purchase_reviews'),1);
    assert.equal(await count('payment_receipts'),0,'manual approval must not fabricate a bank-verified receipt');assert.equal(calls,1);
  });
  await t.test('new, expired and verifying orders can be approved with no upload, bank codes, reference, date or checkbox',async()=>{
    await reset();const admin=await session(adminId),user=await session(),p=await product(admin);
    for(const mode of ['new','expired','verifying']){
      const a=await order(user,p.id);clock+=2000;
      if(mode==='expired')clock=a.expiresAt+1000;
      if(mode==='verifying')await client.execute({sql:"UPDATE purchase_orders SET status='verifying',verify_token='fixture',verify_started_at=? WHERE id=?",args:[clock,a.id]});
      const view=(await call('admin/shop/orders',{cookie:admin})).data.orders.find(o=>o.id===a.id);
      assert.equal(view.slipSha256,null);assert.equal(view.lastError,null);
      assert.equal((await call('admin/shop/orders/'+a.id+'/approve',{method:'POST',cookie:admin,data:approval(view)})).status,200);
      const buyer=(await call('shop/orders/'+a.id,{cookie:user})).data;assert.equal(buyer.key.premium,true);assert.equal(buyer.key.expiresAt,clock+30*86400000);
    }
    assert.equal(await count('access_keys'),3);assert.equal(await count('purchase_reviews'),3);assert.equal(await count('payment_receipts'),0);assert.equal(calls,0);
  });
  await t.test('stale snapshots are rejected, concurrent approvals issue once, and an uploaded image cannot pay two orders',async()=>{
    await reset();const admin=await session(adminId),user=await session(),a=await failedPurchase(admin,user),b=await failedPurchase(admin,user);
    assert.equal((await call('admin/shop/orders/'+a.id+'/approve',{method:'POST',cookie:admin,data:{...approval(a),attempts:99}})).status,409);
    const results=await Promise.all([a,a,b].map(o=>call('admin/shop/orders/'+o.id+'/approve',{method:'POST',cookie:admin,data:approval(o)})));
    assert.ok(results.some(r=>r.status===200));assert.ok(results.every(r=>[200,409].includes(r.status)));
    assert.equal(await count('access_keys'),1);assert.equal(await count('purchase_reviews'),1);
    proof={success:true,transRef:'OTHER-REFERENCE',sendingBank:'004',receivingBank:'006',transTimestamp:new Date(clock).toISOString(),amount:99.90,countryCode:'TH',receiver:{displayName:'TEST SYSTEM'}};
    clock+=901000;const loser=results[2].status===200?a:b;
    const automatic=await call('shop/orders/'+loser.id+'/verify',{method:'POST',cookie:user,data:upload()});assert.equal(automatic.status,409);
    assert.equal(await count('access_keys'),1,'automatic checks also respect manually consumed images');
  });
  await t.test('manual takeover of active automatic verification never issues duplicate access',async()=>{
    await reset();const admin=await session(adminId),user=await session(),p=await product(admin),a=await order(user,p.id);clock+=2000;providerDelay=150;
    const automatic=call('shop/orders/'+a.id+'/verify',{method:'POST',cookie:user,data:upload()});
    while(!calls)await new Promise(resolve=>setTimeout(resolve,1));
    const view=(await call('admin/shop/orders',{cookie:admin})).data.orders.find(o=>o.id===a.id);
    assert.equal((await call('admin/shop/orders/'+a.id+'/approve',{method:'POST',cookie:admin,data:approval(view)})).status,200);
    assert.equal((await automatic).status,200);assert.equal(await count('access_keys'),1);assert.equal(await count('purchase_reviews'),1);assert.equal(await count('payment_receipts'),0);
  });
  await t.test('manual issuance failure rolls back the audit and key and can be retried',async()=>{
    await reset();const admin=await session(adminId),user=await session(),a=await failedPurchase(admin,user),path='admin/shop/orders/'+a.id+'/approve';failBatch=true;
    await assert.rejects(call(path,{method:'POST',cookie:admin,data:approval(a)}));assert.equal(await count('access_keys'),0);assert.equal(await count('purchase_reviews'),0);
    assert.equal((await call(path,{method:'POST',cookie:admin,data:approval(a)})).status,200);
  });
 }finally{client?.close();Date.now=realNow;globalThis.fetch=realFetch;}
});
