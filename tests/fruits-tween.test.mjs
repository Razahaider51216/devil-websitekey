import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
const env = globalThis.__fruitsTestEnv = {};
registerHooks({ resolve(specifier, context, next) {
  if (specifier === 'cloudflare:workers') return { url: 'data:text/javascript,export const env=globalThis.__fruitsTestEnv;', shortCircuit: true };
  if (specifier.startsWith('.') && context.parentURL?.startsWith('file:')) {
    const url = new URL(specifier, context.parentURL);
    if (!existsSync(fileURLToPath(url)) && existsSync(fileURLToPath(url) + '.ts')) return next(pathToFileURL(fileURLToPath(url) + '.ts').href, context);
  }
  return next(specifier, context);
} });
const { GET } = await import('../app/test/fruits-tween/route.ts');
const { fruitsTween } = await import('../lib/fruits-tween-manifest.ts');
test('fresh Tween experiment is isolated, denies document navigation and fails closed on missing/tampered R2 content', async () => {
  const url = 'https://example.test/test/fruits-tween';
  let gets = 0;
  env.SCRIPT_FILES = { async get(key) { gets++; assert.equal(key, fruitsTween.key); return null; } };
  const landing = await GET(new Request(url, { headers: { 'sec-fetch-mode': 'navigate' } }));
  assert.equal(landing.status, 403);
  assert.equal(gets, 0);
  assert.match(await landing.text(), /Huh, what are you doing here/);
  const missing = await GET(new Request(url)); assert.equal(missing.status, 503);
  assert.equal(missing.headers.get('cache-control'), 'no-store');
  env.SCRIPT_FILES = { async get() { return { size: fruitsTween.bytes, arrayBuffer: async () => new Uint8Array(fruitsTween.bytes).buffer }; } };
  assert.equal((await GET(new Request(url))).status, 503);
  env.SCRIPT_FILES = { async get() { return { size: 1 }; } };
  assert.equal((await GET(new Request(url))).status, 503);
  delete env.SCRIPT_FILES;
});
