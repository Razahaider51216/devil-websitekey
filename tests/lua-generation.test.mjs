import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {registerHooks} from 'node:module';
import {existsSync} from 'node:fs';
import {fileURLToPath,pathToFileURL} from 'node:url';
registerHooks({resolve(specifier,context,next){
  if(specifier==='cloudflare:workers')return{url:'data:text/javascript,export const env=globalThis.__luaEnv;',shortCircuit:true};
  if(specifier.startsWith('.')&&context.parentURL?.startsWith('file:')){const p=fileURLToPath(new URL(specifier,context.parentURL));if(!existsSync(p)&&existsSync(p+'.ts'))return next(pathToFileURL(p+'.ts').href,context);}
  return next(specifier,context);
}});
const secret='test-only-lua-'.repeat(4),userId='123456789012345678';
const env=globalThis.__luaEnv={DISCORD_BOT_API_SECRET:secret};
const {handleLuaGeneration,parseLuaResult}=await import('../lib/lua-generation.ts');
const sample={name:'Fly controller',placement:'LocalScript in StarterPlayerScripts',notes:'Toggle the GUI.',code:'print("Studio only")',refusal:''};
let clock=1_800_000_000_000,serial=0,aiCalls=0;
const realNow=Date.now;Date.now=()=>clock;test.after(()=>{Date.now=realNow;});
function reset(){
  const db=new DatabaseSync(':memory:');db.exec('CREATE TABLE rate_limits(id TEXT PRIMARY KEY,hits INTEGER NOT NULL,expires_at INTEGER NOT NULL)');
  class Statement{constructor(sql){this.sql=sql;this.args=[];}bind(...args){this.args=args;return this;}async run(){return{meta:{changes:Number(db.prepare(this.sql).run(...this.args).changes)}};}}
  env.DB={prepare:sql=>new Statement(sql),batch:async statements=>{
    db.exec('BEGIN');try{const rows=statements.map(s=>({results:db.prepare(s.sql).all(...s.args)}));db.exec('COMMIT');return rows;}catch(e){db.exec('ROLLBACK');throw e;}
  }};
  aiCalls=0;env.AI={run:async(model,input)=>{
    aiCalls++;assert.equal(model,'@cf/qwen/qwen2.5-coder-32b-instruct');assert.equal(input.response_format.type,'json_object');
    assert.equal(input.messages[1].role,'user');assert.ok(!JSON.stringify(input).includes(secret));return{response:JSON.stringify(sample)};
  }};
  clock+=100_000;return db;
}
async function call(extra={},auth=secret,method='POST'){
  const input={prompt:'Create a native fly GUI for my Studio game.',userId,guildId:'223456789012345678',channelId:'323456789012345678',messageId:String(423456789012345678n+BigInt(serial++)),...extra};
  const req=new Request('https://example.test/api/bot/scripts/generate',{method,headers:{'Content-Type':'application/json',...(auth?{Authorization:'Bearer '+auth}:{})},...(method==='POST'?{body:JSON.stringify(input)}:{})});
  const response=await handleLuaGeneration(req);return{status:response.status,data:await response.json(),headers:response.headers,input};
}
test('generator authentication precedes body reads, quotas and AI; methods and validation are bounded',async()=>{
  const db=reset();for(const auth of['','wrong-secret'])assert.equal((await call({},auth)).status,401);
  assert.equal((await call({},secret,'GET')).status,405);
  assert.equal((await call({prompt:'x'.repeat(2001)})).status,400);
  assert.equal((await call({userId:'not-an-id'})).status,400);
  assert.equal(db.prepare('SELECT count(*) AS n FROM rate_limits').get().n,0);assert.equal(aiCalls,0);
  const result=await call();assert.equal(result.status,200);assert.equal(result.data.code,sample.code);assert.equal(result.headers.get('cache-control'),'no-store');db.close();
});
test('request replay and per-user burst limits survive independent handler calls',async()=>{
  const db=reset(),first=await call();assert.equal(first.status,200);
  assert.equal((await call({messageId:first.input.messageId})).status,409);
  assert.equal((await call()).status,429);assert.equal(aiCalls,1);
  clock+=31_000;assert.equal((await call()).status,200);assert.equal(aiCalls,2);db.close();
});
test('durable daily and global limits stop inference before spending more quota',async()=>{
  const db=reset();for(let i=0;i<10;i++){clock+=31_000;assert.equal((await call()).status,200);}
  clock+=31_000;assert.equal((await call()).status,429);assert.equal(aiCalls,10);db.close();
  const db2=reset();for(let i=0;i<20;i++)assert.equal((await call({userId:String(123456789012345678n+BigInt(i))})).status,200);
  assert.equal((await call({userId:'999999999999999999'})).status,429);assert.equal(aiCalls,20);db2.close();
});
test('malformed/truncated output, unsupported executor code and upstream failures never become delivered code',async()=>{
  assert.deepEqual(parseLuaResult({response:{...sample}}),sample,'JSON-mode object responses are accepted without requiring another JSON parse');
  assert.throws(()=>parseLuaResult({response:'{"code":'}));
  assert.throws(()=>parseLuaResult({response:JSON.stringify({...sample,code:'hookfunction(game, function() end)'})}));
  const refusal=parseLuaResult({response:JSON.stringify({...sample,code:'untrusted output',refusal:'Use a Studio game you own.'})});assert.equal(refusal.code,'');
  const db=reset();env.AI.run=async()=>{throw new Error('provider-private-detail');};const failed=await call();assert.equal(failed.status,503);assert.ok(!JSON.stringify(failed).includes('provider-private-detail'));db.close();
});
