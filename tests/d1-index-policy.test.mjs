import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { mayDeferIndexes } from '../scripts/d1-index-policy.mjs';
const id = 'a6d4a6f2-6545-45a9-a10f-67e7ebaf02e6';
const output = "Your account has exceeded D1's free tier daily row read limit. [code: 7500]";
const migrations = Object.fromEntries(readdirSync('drizzle').filter(n => n.endsWith('.sql')).map(n => [n, readFileSync('drizzle/' + n, 'utf8')]));
test('only optional indexes on the verified production schema may defer for daily quota', () => {
  const oldSchema = Object.fromEntries(Object.entries(migrations).filter(([name]) => name < '0005'));
  assert.equal(mayDeferIndexes(output, id, oldSchema), true);
  assert.equal(mayDeferIndexes(output, id, migrations), false, 'required plan column must never be skipped');
  assert.equal(mayDeferIndexes('Permission denied code 7500', id, migrations), false);
  assert.equal(mayDeferIndexes(output, 'other-database', migrations), false);
  for (const sql of ['CREATE TABLE x (id text);', 'CREATE UNIQUE INDEX x ON y (id);', 'DROP TABLE y;', 'ALTER TABLE y ADD COLUMN z text;']) {
    assert.equal(mayDeferIndexes(output, id, {...migrations, '0005_future.sql': sql}), false);
  }
  assert.equal(mayDeferIndexes(output, id, {'0004_index.sql': 'CREATE INDEX x ON y (id);'}), false);
});
