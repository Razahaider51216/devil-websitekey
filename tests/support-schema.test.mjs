import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {createClient} from '@libsql/client';
test('support migration preserves existing keys/devices and indexes conversation pagination',async()=>{
  const db=createClient({url:':memory:'});
  try {
    for(const file of readdirSync(new URL('../drizzle/',import.meta.url)).filter(name=>name.endsWith('.sql')&&!name.startsWith('0007')).sort())await db.executeMultiple(readFileSync(new URL('../drizzle/'+file,import.meta.url),'utf8'));
    await db.execute("INSERT INTO access_keys(id,key_hash,label,source,created_at,duration_kind,duration_amount) VALUES('fixture-key','fixture-hash','existing','admin',100,'permanent',0)");
    await db.execute("INSERT INTO key_devices(key_id,hwid_hash,bound_at) VALUES('fixture-key','fixture-device',101)");
    const keys=(await db.execute('SELECT * FROM access_keys')).rows,devices=(await db.execute('SELECT * FROM key_devices')).rows;
    await db.executeMultiple(readFileSync(new URL('../drizzle/0007_support_chat.sql',import.meta.url),'utf8'));
    assert.deepEqual((await db.execute('SELECT * FROM access_keys')).rows,keys);
    assert.deepEqual((await db.execute('SELECT * FROM key_devices')).rows,devices);
    const indexes=(await db.execute("SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'support_%'")).rows.map(row=>row.name);
    assert.ok(indexes.includes('support_threads_last_message_idx'));
    assert.ok(indexes.includes('support_messages_thread_idx'));
    assert.ok(indexes.includes('support_messages_retry_idx'));
  } finally {db.close();}
});
