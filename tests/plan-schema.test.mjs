import test from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@libsql/client';
import { ensurePlanSchema } from '../scripts/turso-plan-schema.mjs';
test('live schema upgrade is additive and repeatable; existing flows and keys survive',async()=>{
  const db=createClient({url:':memory:'});
  try {
    await db.executeMultiple("CREATE TABLE flows(id text primary key,created_at integer,expires_at integer); INSERT INTO flows VALUES('old-flow',10,99999999); CREATE TABLE access_keys(id text primary key,key_hash text,expires_at integer); INSERT INTO access_keys VALUES('old-key','unchanged',12345);");
    assert.equal(await ensurePlanSchema(db),true);assert.equal(await ensurePlanSchema(db),false);
    assert.equal((await db.execute('select plan from flows')).rows[0].plan,null);
    assert.deepEqual(Array.from((await db.execute('select * from access_keys')).rows[0]),['old-key','unchanged',12345]);
  } finally {db.close();}
});
