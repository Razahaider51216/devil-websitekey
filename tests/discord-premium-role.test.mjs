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
const { claimPremiumRole: resetPremiumHwid } = await import('../lib/discord-premium-role.ts');
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

test('premium role accepts purchased/admin keys and binds each to one Discord account without touching HWID', async () => {
  for (const source of ['admin','purchase']) {
    const f=fixture(); await f.seed({source});
    assert.equal((await f.call()).data.status,'eligible');
    assert.equal((await f.call()).status,200);
    assert.equal((await f.call({discordUserId:'999999999999999999'})).status,403);
    assert.equal(f.sqlite.prepare('SELECT count(*) AS n FROM key_devices').get().n,1);
    assert.ok(!JSON.stringify(f.sqlite.prepare('SELECT * FROM site_settings').all()).includes(premium));
  }
});
test('reject free/expired/revoked/wrong Discord owner and missing authorization', async () => {
  for (const props of [{source:'steps'},{expires:Date.now()-1},{revoked:Date.now()},{owner:'999999999999999999'}]) {
    const f=fixture(); await f.seed(props); assert.equal((await f.call()).status,403);
  }
  const f=fixture();await f.seed();assert.equal((await f.call({},'')).status,401);
  assert.equal(f.sqlite.prepare('SELECT count(*) AS n FROM site_settings').get().n,0);
});
test('Google purchasers can link once and revoked claims cannot be reused', async () => {
  const f=fixture();await f.seed({source:'purchase',owner:'google:fixture'});
  assert.equal((await f.call()).status,200);
  f.sqlite.prepare('UPDATE access_keys SET revoked_at=1').run();
  assert.equal((await f.call()).status,403);
});
test('claim race has a single Discord winner and attempts are rate limited',async()=>{
  const f=fixture();await f.seed();
  const results=await Promise.all([f.call(),f.call({discordUserId:'999999999999999999'})]);
  assert.equal(results.filter(r=>r.status===200).length,1);
  for(let i=0;i<5;i++)await f.call({key:'invalid'});
  assert.equal((await f.call()).status,429);
});
