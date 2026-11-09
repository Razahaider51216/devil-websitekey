import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createClient} from '@libsql/client';
import {parseLog,quantity,imageAsset,logImageURL,formatLogAmount} from '../lib/script-log-domain.ts';
const payload=()=>({game:'break',sessionId:'test-session-0001',player:'Tester',balance:'3.5e+46',events:[{id:'event-0001',name:'Lion',rarity:'Omega',amount:1,statuses:['Gold','Gold'],assetId:'rbxassetid://12345',income:'1.5e12'}]});
test('LOG accepts the three game snapshots and large game currencies without rounding strings',()=>{
 for(const game of ['break','anime','throw']){
  const p=payload();p.game=game;const v=parseLog(p);assert.equal(v.game,game);assert.equal(v.balance,'3.5e+46');assert.deepEqual(v.events[0].statuses,['Gold']);assert.equal(v.events[0].assetId,'12345');
 }
 assert.equal(formatLogAmount('1000000000000'),'1T');assert.equal(formatLogAmount('3.5e46'),'3.50e+46');assert.equal(formatLogAmount(null),'—');
});
test('LOG rejects unsupported games, invalid IDs, oversized batches and unsafe image sources',()=>{
 for(const p of [{...payload(),game:'other'},{...payload(),sessionId:'bad'},{...payload(),balance:'Infinity'}, {...payload(),events:Array(21).fill(payload().events[0])}])assert.throws(()=>parseLog(p));
 for(const url of ['http://tr.rbxcdn.com/a','https://rbxcdn.com.evil.test/a','https://localhost/a','https://user:pass@tr.rbxcdn.com/a','javascript:alert(1)'])assert.throws(()=>logImageURL(url));
 assert.equal(logImageURL('https://tr.rbxcdn.com/abc/150/150/Image/Png'),'https://tr.rbxcdn.com/abc/150/150/Image/Png');
 for(const v of ['-1','nan','1e999',{},'0x123'])assert.throws(()=>quantity(v));
 assert.throws(()=>imageAsset('../1'));assert.throws(()=>parseLog({...payload(),events:[payload().events[0],payload().events[0]]}));
});
test('LOG migration separates owners, deduplicates retries, and indexes owner cursor reads',async()=>{
 const db=createClient({url:':memory:'});
 try{
  await db.executeMultiple(readFileSync(new URL('../drizzle/0012_script_logs.sql',import.meta.url),'utf8'));
  for(const owner of ['discord:a','google:b']){
   await db.execute({sql:'INSERT INTO script_log_links VALUES(?,?,?,?)',args:[owner,owner+'-link','fixture-hash',1]});
   await db.execute({sql:'INSERT INTO script_log_sessions VALUES(?,?,?,?,?,?,?)',args:[owner+'-session',owner,'anime','Tester','1e20',1,2]});
   for(let n=0;n<2;n++)await db.execute({sql:'INSERT OR IGNORE INTO script_log_events(owner_id,event_id,session_id,game,player,item,created_at) VALUES(?,?,?,?,?,?,?)',args:[owner,'same-event',owner+'-session','anime','Tester','{}',1]});
  }
  assert.equal((await db.execute('SELECT * FROM script_log_events')).rows.length,2);
  assert.equal((await db.execute({sql:'SELECT * FROM script_log_events WHERE owner_id=? ORDER BY id',args:['discord:a']})).rows.length,1);
  const plan=await db.execute("EXPLAIN QUERY PLAN SELECT * FROM script_log_events WHERE owner_id='discord:a' AND id>0 ORDER BY id LIMIT 101");
  assert.match(JSON.stringify(plan.rows),/script_log_events_owner_cursor/);
  await assert.rejects(()=>db.execute("INSERT INTO script_log_links VALUES('discord:a','another','hash',2)"));
 }finally{db.close();}
});
