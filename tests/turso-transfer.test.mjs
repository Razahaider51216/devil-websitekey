import test from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@libsql/client';
import { readFileSync, readdirSync } from 'node:fs';
import { tables, transfer } from '../scripts/turso-transfer.mjs';
import { drizzle } from 'drizzle-orm/libsql';
import { sqliteTable, text } from 'drizzle-orm/sqlite-core';

async function fixture() {
  const db = createClient({ url: ':memory:' });
  for (const file of readdirSync('drizzle').filter(n => n.endsWith('.sql')).sort()) await db.executeMultiple(readFileSync('drizzle/' + file, 'utf8'));
  await db.execute("INSERT INTO flows (id,created_at,expires_at) VALUES ('flow',1,9999999999999)");
  await db.execute("INSERT INTO access_keys VALUES ('permanent','flow','hash-original','Original','public',1,NULL,NULL,'permanent',0,'123456789012345678')");
  await db.execute("INSERT INTO access_keys VALUES ('revoked',NULL,'hash-revoked','Revoked','admin',1,9999999999999,100,'days',3,NULL)");
  await db.execute("INSERT INTO key_devices VALUES ('permanent','same-hwid-hash',50)");
  await db.execute("INSERT INTO site_settings VALUES ('links','{}',10)");
  await db.execute("INSERT INTO flow_verifications VALUES ('flow',20)");
  await db.execute("INSERT INTO steps VALUES ('step','flow',1,10,20,'link-hash')");
  const snapshot = { format: 'devil-key-d1-v1', tables: {} };
  for (const table of tables) {
    const result = await db.execute(`SELECT * FROM ${table}`);
    snapshot.tables[table] = { columns: result.columns, rows: result.rows.map(r => Array.from(r)) };
  }
  db.close(); return snapshot;
}
test('Turso import preserves every field; repeat import refuses; verification catches altered HWID', async () => {
  const source = await fixture(), db = createClient({ url: ':memory:' });
  try {
    assert.equal((await transfer(db, source, 'import')).access_keys, 2);
    await transfer(db, source, 'verify');
    // Exercise the ORM getter shape used by existing key routes.
    const keys = sqliteTable('access_keys', { id: text('id'), hash: text('key_hash') });
    assert.equal((await drizzle(db).select().from(keys).get()).hash, 'hash-original');
    await assert.rejects(transfer(db, source, 'import'), /empty/);
    await db.execute("UPDATE key_devices SET hwid_hash='changed'");
    await assert.rejects(transfer(db, source, 'verify'), /mismatch/);
  } finally { db.close(); }
});
test('incomplete snapshots and nonempty targets fail before changing data', async () => {
  const db = createClient({ url: ':memory:' });
  try {
    await assert.rejects(transfer(db, { format: 'devil-key-d1-v1', tables: {} }, 'import'), /Incomplete/);
    assert.equal((await db.execute("SELECT name FROM sqlite_master WHERE type='table'")).rows.length, 0);
  } finally { db.close(); }
});
test('schema mismatch rolls back all imported tables and rows', async () => {
  const source = await fixture(), db = createClient({ url: ':memory:' });
  source.tables.key_devices.columns[1] = 'wrong_column';
  try {
    await assert.rejects(transfer(db, source, 'import'), /Schema mismatch/);
    assert.equal((await db.execute("SELECT name FROM sqlite_master WHERE type='table'")).rows.length, 0);
  } finally { db.close(); }
});
