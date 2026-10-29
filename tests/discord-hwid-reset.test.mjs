import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { registerHooks } from 'node:module';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
registerHooks({ resolve(specifier, context, next) {
  if (specifier.startsWith('.') && context.parentURL?.startsWith('file:')) {
    const path = fileURLToPath(new URL(specifier, context.parentURL));
    if (!existsSync(path) && existsSync(path + '.ts')) return next(pathToFileURL(path + '.ts').href, context);
  }
  return next(specifier, context);
} });
const { resetPremiumHwid } = await import('../lib/discord-hwid-reset.ts');
const { hash } = await import('../lib/domain.ts');
const secret = 'discord-reset-integration-only-'.repeat(2);
const actor = '123456789012345678';
const premium = 'DEVIL-11111111-22222222-33333333-44444444';
function fixture() {
  const sqlite = new DatabaseSync(':memory:');
  for (const file of readdirSync(new URL('../drizzle/', import.meta.url)).filter(x => x.endsWith('.sql')).sort()) {
    sqlite.exec(readFileSync(new URL('../drizzle/' + file, import.meta.url), 'utf8'));
  }
  class Statement {
    constructor(sql) { this.sql = sql; this.args = []; }
    bind(...args) { this.args = args; return this; }
    async first() { return sqlite.prepare(this.sql).get(...this.args) || null; }
  }
  const db = {
    prepare: sql => new Statement(sql),
    batch: async statements => {
      sqlite.exec('BEGIN');
      try {
        const result = statements.map(s => ({ success: true, meta: { changes: Number(sqlite.prepare(s.sql).run(...s.args).changes) } }));
        sqlite.exec('COMMIT'); return result;
      } catch (e) { sqlite.exec('ROLLBACK'); throw e; }
    },
  };
  const call = async (body = {}, auth = secret) => {
    const response = await resetPremiumHwid(new Request('https://example.test/api/bot/reset-hwid', {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: 'Bearer ' + auth } : {}) },
      body: JSON.stringify({ key: premium, discordUserId: actor, interactionId: '222222222222222222', ...body }),
    }), db, secret);
    return { status: response.status, data: await response.json() };
  };
  const seed = async (props = {}) => {
    sqlite.prepare(`INSERT INTO access_keys(id,key_hash,label,source,created_at,expires_at,revoked_at,duration_kind,duration_amount,owner_id)
      VALUES('fixture',?,'Premium fixture',?,1,?,?,?,1,?)`).run(await hash(premium), props.source || 'admin', props.expires ?? null,
      props.revoked ?? null, props.expires ? 'days' : 'permanent', props.owner ?? null);
    sqlite.prepare("INSERT INTO key_devices VALUES('fixture','old-device-hash',1)").run();
  };
  return { sqlite, db, call, seed };
}
test('bot reset rejects missing/incorrect authentication before reading or mutating D1', async () => {
  const f = fixture(); await f.seed();
  for (const auth of ['', 'wrong-token-but-long-enough-1234567890']) assert.equal((await f.call({}, auth)).status, 401);
  assert.equal(f.sqlite.prepare('SELECT count(*) AS n FROM rate_limits').get().n, 0);
  assert.equal(f.sqlite.prepare('SELECT count(*) AS n FROM key_devices').get().n, 1);
});
test('only active admin-created keys qualify; free, expired, revoked and another assigned owner do not', async () => {
  for (const props of [{ source: 'steps' }, { expires: Date.now() - 1 }, { revoked: Date.now() }, { owner: '999999999999999999' }]) {
    const f = fixture(); await f.seed(props);
    assert.equal((await f.call()).status, 403);
    assert.equal(f.sqlite.prepare('SELECT count(*) AS n FROM key_devices').get().n, 1);
  }
});
test('reset preserves key and expiry, records only hashes, and replay cannot erase a newly bound device', async () => {
  const f = fixture(); await f.seed({ expires: Date.now() + 86400000 });
  const original = f.sqlite.prepare('SELECT * FROM access_keys').get();
  assert.equal((await f.call()).data.status, 'reset');
  assert.equal(f.sqlite.prepare('SELECT count(*) AS n FROM key_devices').get().n, 0);
  assert.deepEqual(f.sqlite.prepare('SELECT * FROM access_keys').get(), original);
  const audit = JSON.parse(f.sqlite.prepare("SELECT value FROM site_settings WHERE id='discord:hwid-reset:fixture'").get().value);
  assert.equal(audit.blockedHwidHash, 'old-device-hash');
  assert.equal(audit.actorId, actor); assert.ok(audit.blockedUntil > Date.now());
  assert.ok(!JSON.stringify(audit).includes(premium));
  f.sqlite.prepare("INSERT INTO key_devices VALUES('fixture','new-device-hash',2)").run();
  assert.equal((await f.call()).data.status, 'already_processed');
  assert.equal((await f.call({ interactionId: '333333333333333333' })).status, 429);
  assert.equal(f.sqlite.prepare('SELECT hwid_hash FROM key_devices').get().hwid_hash, 'new-device-hash');
});
test('concurrent reset requests have one winner and the cooldown claim is atomic', async () => {
  const f = fixture(); await f.seed();
  const result = await Promise.all([f.call(), f.call({ interactionId: '333333333333333333' })]);
  assert.equal(result.filter(x => x.data.status === 'reset').length, 1);
  assert.equal(f.sqlite.prepare('SELECT count(*) AS n FROM key_devices').get().n, 0);
});
test('invalid user IDs and unknown keys fail safely; attempts are bounded per Discord user', async () => {
  const f = fixture(); await f.seed();
  assert.equal((await f.call({ discordUserId: 'not-a-user' })).status, 400);
  for (let i = 0; i < 5; i++) assert.equal((await f.call({ key: 'not-a-key' })).status, 403);
  assert.equal((await f.call()).status, 429);
  assert.equal(f.sqlite.prepare('SELECT count(*) AS n FROM key_devices').get().n, 1);
});
