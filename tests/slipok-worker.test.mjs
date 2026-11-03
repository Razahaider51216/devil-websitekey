// Real workerd Request/fetch behavior; all provider traffic is intercepted.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { Miniflare, createFetchMock } from 'miniflare';

async function worker({ legacy = false, status = 200, headers = {}, body = { success: true, data: { reference: 'fixture' } } } = {}) {
  const bundle = await build({
    stdin: {
      resolveDir: fileURLToPath(new URL('../', import.meta.url)), loader: 'ts',
      contents: `import {checkSlip} from './lib/slipok.ts';
        export default {async fetch(){
          const file=new File([new Uint8Array([255,216,255,217])],'slip.jpg',{type:'image/jpeg'});
          try{return Response.json({data:await checkSlip(file,9990,'123','worker-fixture-secret')});}
          catch(error){return Response.json({code:error.code,message:error.message},{status:error.status||500});}
        }}`,
    },
    bundle: true, format: 'esm', platform: 'browser', write: false,
    plugins: legacy ? [{ name: 'reproduce-unsupported-redirect', setup(context) {
      context.onLoad({ filter: /[\\/]lib[\\/]slipok\.ts$/ }, async ({ path }) => ({
        contents: (await readFile(path, 'utf8')).replace('redirect: "manual"', 'redirect: "error"'), loader: 'ts',
      }));
    } }] : [],
  });
  const fetchMock = createFetchMock();fetchMock.disableNetConnect();
  let request;
  fetchMock.get('https://api.slipok.com').intercept({ path: '/api/line/apikey/123', method: 'POST' }).reply(options => {
    request = options;
    return { statusCode: status, data: JSON.stringify(body), responseOptions: { headers: { 'content-type': 'application/json', ...headers } } };
  });
  const runtime = new Miniflare({ modules: true, compatibilityDate: '2026-05-15', script: bundle.outputFiles[0].text, fetchMock });
  try {
    const response = await runtime.dispatchFetch('https://worker.test/');
    return { status: response.status, data: await response.json(), request };
  } finally { await runtime.dispose();await fetchMock.close(); }
}

test('workerd reproduces the old pre-request failure and accepts the fixed SlipOK multipart request', async () => {
  const old = await worker({ legacy: true });
  assert.equal(old.status, 503);assert.equal(old.data.code, 'SLIP_UNAVAILABLE');
  assert.equal(old.request, undefined, 'legacy fetch failed before contacting the provider');
  const fixed = await worker();
  assert.equal(fixed.status, 200);assert.deepEqual(fixed.data.data, { reference: 'fixture' });
  assert.ok(fixed.request, 'fixed request reaches the provider mock');
  const sentHeaders = new Headers(fixed.request.headers);
  assert.equal(sentHeaders.get('x-authorization'), 'worker-fixture-secret');
  const form = await new Response(fixed.request.body, { headers: { 'Content-Type': sentHeaders.get('content-type') } }).formData();
  assert.equal(form.get('amount'), '99.90');assert.equal(form.get('log'), 'true');
  assert.equal(form.get('files').type, 'image/jpeg');assert.equal(form.get('files').size, 4);
});

test('workerd rejects provider redirects and failures without approving or forwarding a slip', async () => {
  const redirected = await worker({ status: 302, headers: { location: 'https://untrusted.test/slip' } });
  assert.equal(redirected.status, 503);assert.equal(redirected.data.code, 'SLIP_UNAVAILABLE');
  assert.ok(!JSON.stringify(redirected.data).includes('worker-fixture-secret'));
  const failed = await worker({ status: 503, body: { code: 1009 } });
  assert.equal(failed.status, 503);assert.equal(failed.data.code, 'SLIP_BANK_UNAVAILABLE');
});

test('workerd preserves verified bank data on a duplicate reply but rejects a duplicate without proof', async () => {
  const bank = { success: true, transRef: 'BANK-REFERENCE', amount: 99.90 };
  const recovered = await worker({ status: 400, body: { code: 1012, data: bank } });
  assert.equal(recovered.status, 200);assert.deepEqual(recovered.data.data, bank);
  for (const data of [undefined, {}, { success: false }]) {
    const rejected = await worker({ status: 400, body: { code: 1012, data } });
    assert.equal(rejected.status, 409);assert.equal(rejected.data.code, 'SLIP_DUPLICATE');
  }
});
