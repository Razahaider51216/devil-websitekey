import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
const env = globalThis.__bloxTestEnv = {};
registerHooks({ resolve(specifier, context, next) {
  if (specifier === 'cloudflare:workers') return { url: 'data:text/javascript,export const env=globalThis.__bloxTestEnv;', shortCircuit: true };
  if (specifier.startsWith('.') && context.parentURL?.startsWith('file:')) {
    const url = new URL(specifier, context.parentURL);
    if (!existsSync(fileURLToPath(url)) && existsSync(fileURLToPath(url) + '.ts')) return next(pathToFileURL(fileURLToPath(url) + '.ts').href, context);
  }
  return next(specifier, context);
} });
const { GET } = await import('../app/test/blox-progress/route.ts');
const { bloxTest } = await import('../lib/blox-test-manifest.ts');
test('standalone no-key Blox route rejects browser navigation and fails closed for missing/corrupt objects', async () => {
  const req = () => new Request('https://example.test/test/blox-progress');
  const browser = await GET(new Request(req(), { headers: { accept: 'text/html' } }));
  assert.equal(browser.status, 403);
  assert.match(await browser.text(), /Huh, what are you doing here/);
  assert.equal((await GET(req())).status, 503);
  const corrupted = new Uint8Array(bloxTest.bytes);
  env.SCRIPT_FILES = { async get(key) {
    assert.equal(key, bloxTest.key);
    return { size: bloxTest.bytes, arrayBuffer: async () => corrupted.buffer };
  } };
  assert.equal((await GET(req())).status, 503);
  env.SCRIPT_FILES = { async get() { return { size: 1 }; } };
  assert.equal((await GET(req())).status, 503);
  delete env.SCRIPT_FILES;
});
